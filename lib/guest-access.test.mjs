import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as guest from "./guest-access.mjs";
import { emailRetry, receiptMessage } from "./purchase-email.mjs";

test("guest cookies use a random secret, a hash and an enforced expiry", () => {
  const secret = guest.newGuestSecret();
  assert.equal(secret.length, 43);
  assert.notEqual(secret, guest.newGuestSecret());
  const session = { id: "session", token_hash: guest.tokenHash(secret), expires_at: new Date(Date.now() + 10000).toISOString() };
  assert.equal(guest.guestCookieSecret(`other=1; sellow_checkout=${secret}`), secret);
  assert.equal(guest.guestCookieSecret("sellow_checkout=forged"), null);
  assert.equal(guest.guestSessionMatches(session, secret), true);
  assert.equal(guest.guestSessionMatches(session, guest.newGuestSecret()), false);
  assert.equal(guest.guestSessionMatches({ ...session, expires_at: "2000-01-01" }, secret), false);
  assert.equal(guest.guestSessionMatches({ ...session, expires_at: "invalid" }, secret), false);
});
test("an order id, email or another buyer never authorizes tracking", () => {
  const order = { id: "order", buyer_id: null, purchase_identity: "guest", guest_session_id: "session" };
  assert.equal(guest.orderCanBeTracked(order, null, "session"), true);
  assert.equal(guest.orderCanBeTracked(order, null, "forged"), false);
  assert.equal(guest.orderCanBeTracked(order, "buyer", null), false);
  assert.equal(guest.orderCanBeTracked({ ...order, buyer_id: "buyer" }, "other", null), false);
  assert.equal(guest.orderCanBeTracked({ ...order, buyer_id: "buyer" }, "buyer", null), true);
  assert.equal(guest.orderCanBeTracked({ ...order, purchase_identity: "account" }, null, "session"), false);
});
test("recovery destinations are internal and each product opens its appropriate page", () => {
  for (const value of ["https://evil.example", "//evil.example", "/\\evil", "/admin", null]) assert.equal(guest.safeRecoveryNext(value), "/bibliotheque");
  assert.equal(guest.purchaseDestination({ id: "order", productSlug: "cours", productKind: "course" }), "/apprendre/cours");
  assert.equal(guest.purchaseDestination({ id: "order", productKind: "download" }), "/contenu/order?telecharger=1");
  for (const productKind of ["membership", "physical", "service"]) assert.equal(guest.purchaseDestination({ id: "order", productKind }), "/contenu/order");
});
test("receipt templates escape creator text, expose no content and cover all five types", () => {
  for (const product_kind of ["download", "course", "membership", "physical", "service"]) {
    const receipt = receiptMessage({ id: "order", amount: 1200, currency: "EUR", product_title: '<img src=x onerror="alert(1)">', product_kind, access_token: "private-secret" });
    assert.match(receipt.html, /&lt;img/);
    assert.doesNotMatch(receipt.html, /<img|private-secret|saspay/i);
    assert.match(receipt.text, /12,00.*€/);
    assert.match(receipt.html, /achats\/retrouver\?commande=order/);
  }
  assert.throws(() => receiptMessage({ id: "order" }, "http://evil.example"));
  assert.equal(emailRetry(1, 0).nextAttemptAt, new Date(60000).toISOString());
  assert.equal(emailRetry(5).status, "pending");
  assert.equal(emailRetry(6).status, "failed");
});

const require = createRequire(import.meta.url);
const ts = require("typescript");
function route(path, dependencies) {
  const result = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), result, result.exports);
  return result.exports;
}
function otpHarness(t, { verified = true, available = true, rate = true, order = null } = {}) {
  const before = process.env.EMAIL_OTP_ENABLED;
  process.env.EMAIL_OTP_ENABLED = available ? "true" : "false";
  t.after(() => { if (before === undefined) delete process.env.EMAIL_OTP_ENABLED; else process.env.EMAIL_OTP_ENABLED = before; });
  const calls = [];
  const admin = { rpc: async (name, params) => { calls.push({ name, params }); return { error: null, data: 1 }; }, from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: order }) }) };
  const auth = { auth: {
    verifyOtp: async (params) => { calls.push({ name: "verifyOtp", params }); return verified ? { data: { user: { id: "verified-buyer", email: "buyer@example.com" }, session: {} }, error: null } : { data: { user: null, session: null }, error: { message: "Invalid token" } }; },
    signInWithOtp: async (params) => { calls.push({ name: "signInWithOtp", params }); return { error: null }; },
  } };
  const dependencies = {
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/supabase/server": { getSupabaseServerClient: async () => auth },
    "@/lib/guest-access.mjs": guest,
    "@/lib/checkout-identity": { sameOrigin: (r) => r.headers.get("origin") === new URL(r.url).origin, consumeRateLimit: async () => rate, trackedOrder: async () => order ? { order, buyer: false } : null, serializeTrackedOrder: (row) => ({ id: row.id, productSlug: row.product_slug, productKind: row.product_kind }) },
  };
  const request = (body, origin = "https://sellow.fun") => new Request("https://sellow.fun/api/auth/otp/verify", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
  return { calls, request, verify: route("../app/api/auth/otp/verify/route.ts", dependencies).POST, ask: route("../app/api/auth/otp/request/route.ts", dependencies).POST };
}
test("OTP claims only the freshly verified identity, never the submitted buyer id", async (t) => {
  const h = otpHarness(t);
  const response = await h.verify(h.request({ email: "BUYER@example.com", code: "123456", buyerId: "attacker", next: "//evil.example" }));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls[1], { name: "claim_guest_orders", params: { p_buyer_id: "verified-buyer", p_verified_email: "buyer@example.com" } });
  assert.equal((await response.json()).next, "/bibliotheque");
});
test("invalid, expired or reused OTP never reaches the claim RPC", async (t) => {
  const h = otpHarness(t, { verified: false });
  assert.equal((await h.verify(h.request({ email: "buyer@example.com", code: "123456" }))).status, 400);
  assert.equal(h.calls.length, 1);
});
test("OTP activation, origin and attempt limits are enforced before verification", async (t) => {
  const h = otpHarness(t, { rate: false });
  assert.equal((await h.verify(h.request({ email: "buyer@example.com", code: "123456" }))).status, 429);
  assert.equal((await h.verify(h.request({ email: "buyer@example.com", code: "123456" }, "https://evil.example"))).status, 403);
  process.env.EMAIL_OTP_ENABLED = "false";
  assert.equal((await h.verify(h.request({ email: "buyer@example.com", code: "123456" }))).status, 503);
  assert.equal(h.calls.length, 0);
});
test("receipt-scoped codes use the tracked paid email, never an arbitrary submitted address", async (t) => {
  const h = otpHarness(t, { order: { id: "order", buyer_email: "buyer@example.com", status: "paid" } });
  const response = await h.ask(h.request({ email: "attacker@example.com", orderId: "order" }));
  assert.equal(response.status, 200);
  assert.equal(h.calls[0].params.email, "buyer@example.com");
});
test("an order id alone cannot trigger a code for another order", async (t) => {
  const h = otpHarness(t);
  assert.equal((await h.ask(h.request({ email: "buyer@example.com", orderId: "unowned" }))).status, 404);
  assert.equal(h.calls.length, 0);
});
