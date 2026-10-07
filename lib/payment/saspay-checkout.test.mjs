import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as checkout from "./saspay-checkout.mjs";
import * as accounting from "./accounting.mjs";
import { diagnoseSasPayCheckout } from "../../scripts/saspay-checkout-diagnostic.mjs";

const session = (mode, overrides = {}) => ({
  id: "session-1", checkout_url: "https://pay.saspay.me/checkout/test-session",
  status: "PENDING", fee_charge_mode: mode, ...overrides,
});

test("normalizes only recognized string fee modes", () => {
  assert.equal(checkout.normalizeSasPayFeeMode(" deducted "), "DEDUCTED");
  assert.equal(checkout.normalizeSasPayFeeMode("add_on"), "ADD_ON");
  for (const value of [null, undefined, "", " ", "unknown", 12, {}, [], true]) {
    assert.equal(checkout.normalizeSasPayFeeMode(value), null);
  }
});

test("unwraps the observed live envelope while preserving bare responses and rejecting failures", () => {
  const resource = session("DEDUCTED");
  assert.equal(checkout.unwrapSasPayResponse({ success: true, data: resource, code: "created" }), resource);
  assert.equal(checkout.unwrapSasPayResponse(resource), resource);
  for (const body of [{ success: false, data: resource }, { success: "true", data: resource }, { success: true }]) {
    assert.throws(() => checkout.unwrapSasPayResponse(body));
  }
});

test("a confirmed creation response provides the URL without an extra request", async () => {
  const checked = await checkout.checkSasPayCheckout({ getCheckoutSession: () => assert.fail("unexpected GET") }, session("DEDUCTED"));
  assert.equal(checked.outcome, "CONFIRMED");
  assert.equal(checked.checkoutUrl, session().checkout_url);
});

test("accepts the actual hosted checkout origin as well as the documented legacy format", async () => {
  const checked = await checkout.checkSasPayCheckout({}, session("DEDUCTED", { checkout_url: "https://checkout.saspay.me/test-session" }));
  assert.equal(checked.outcome, "CONFIRMED");
  assert.equal(checked.checkoutUrl, "https://checkout.saspay.me/test-session");
  for (const checkout_url of ["https://checkout.saspay.me/", "https://checkout.saspay.me.evil.example/test", "http://checkout.saspay.me/test"]) {
    assert.equal((await checkout.checkSasPayCheckout({}, session("DEDUCTED", { checkout_url }))).checkoutUrl, null);
  }
});

test("empty, missing and malformed creation modes are resolved from the session detail", async () => {
  for (const value of ["", undefined, null, { secret: "must-not-appear" }, 42, "invalid"]) {
    let reads = 0;
    const checked = await checkout.checkSasPayCheckout({
      getCheckoutSession: async (id) => { reads++; assert.equal(id, "session-1"); return session("DEDUCTED"); },
    }, session(value));
    assert.equal(reads, 1);
    assert.equal(checked.outcome, "CONFIRMED");
    assert.equal(checked.diagnostic.detailResult, "ok");
    assert.ok(!JSON.stringify(checked.diagnostic).includes("must-not-appear"));
  }
});

test("unknown modes in both responses never provide a redirect URL", async () => {
  for (const value of [undefined, null, "", "invalid", {}]) {
    const checked = await checkout.checkSasPayCheckout({ getCheckoutSession: async () => session(value) }, session(value));
    assert.equal(checked.outcome, "FEE_MODE_UNCONFIRMED");
    assert.equal(checked.checkoutUrl, null);
    assert.equal(checked.sessionId, "session-1");
  }
});

test("explicit ADD_ON remains incompatible even when the detail omits the mode", async () => {
  const checked = await checkout.checkSasPayCheckout({ getCheckoutSession: async () => session(undefined) }, session("ADD_ON"));
  assert.equal(checked.outcome, "FEE_MODE_MISMATCH");
  assert.equal(checked.checkoutUrl, null);
});

test("detail request failures are neutral and retain the reference without leaking errors", async () => {
  const checked = await checkout.checkSasPayCheckout({
    getCheckoutSession: async () => { throw new Error("Bearer secret buyer@example.com"); },
  }, session(undefined));
  assert.equal(checked.outcome, "FEE_MODE_UNCONFIRMED");
  assert.equal(checked.sessionId, "session-1");
  assert.equal(checked.checkoutUrl, null);
  assert.equal(checked.diagnostic.detailResult, "request_failed");
  assert.ok(!JSON.stringify(checked).includes("Bearer"));
});

test("reused sessions always refresh the mode rather than trusting saved confirmation", async () => {
  for (const detailMode of ["ADD_ON", undefined]) {
    const checked = await checkout.checkSasPayCheckout({ getCheckoutSession: async () => session(detailMode) }, session("DEDUCTED"), { refresh: true });
    assert.equal(checked.checkoutUrl, null);
    assert.equal(checked.diagnostic.creationFeeMode, "not_checked");
  }
  const checked = await checkout.checkSasPayCheckout({ getCheckoutSession: async () => session("DEDUCTED") }, { id: "session-1" }, { refresh: true });
  assert.equal(checked.outcome, "CONFIRMED");
});

test("wrong session identities, expired sessions and untrusted URLs cannot redirect", async () => {
  const wrongId = await checkout.checkSasPayCheckout({ getCheckoutSession: async () => session("DEDUCTED", { id: "other-session" }) }, session(undefined));
  assert.equal(wrongId.outcome, "INVALID_SESSION");
  assert.equal(wrongId.checkoutUrl, null);
  for (const status of ["EXPIRED", "CANCELLED", "PAID", undefined, {}]) {
    const checked = await checkout.checkSasPayCheckout({}, session("DEDUCTED", { status }));
    assert.equal(checked.outcome, "SESSION_UNAVAILABLE");
    assert.equal(checked.checkoutUrl, null);
  }
  for (const url of ["https://attacker.example/checkout/a", "http://pay.saspay.me/checkout/a", "https://secret@pay.saspay.me/checkout/a", "https://pay.saspay.me/other", 12]) {
    const checked = await checkout.checkSasPayCheckout({}, session("DEDUCTED", { checkout_url: url }));
    assert.equal(checked.outcome, "INVALID_SESSION");
    assert.equal(checked.checkoutUrl, null);
  }
});

// Compile the real handler with injected server dependencies, without a project,
// credentials, network requests, or changes to the production module loader.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeSource = readFileSync(new URL("../../app/api/checkout/route.ts", import.meta.url), "utf8");
function loadRoute(dependencies) {
  const compiledModule = { exports: {} };
  const compiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

function loadSasPayClient() {
  const compiledModule = { exports: {} };
  const source = readFileSync(new URL("./saspay.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", compiled)((name) => name === "server-only" ? {}
    : name === "@/lib/payment/saspay-checkout.mjs" ? checkout : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports.SasPayClient;
}

test("the actual server client decodes enveloped creation, detail, status and payment verification responses", async (t) => {
  const Client = loadSasPayClient();
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, init });
    const data = url.includes("/verify/") ? { id: "payment-1", status: "SUCCESS", fee_charge_mode: "DEDUCTED" } : session("DEDUCTED");
    return Response.json({ success: true, data, code: "ok" });
  });
  const client = new Client("server-test-key");
  const created = await client.createCheckout({ marker: "A12345678901", amount: "12.00", currency: "EUR" });
  assert.equal(created.id, "session-1");
  assert.equal(created.fee_charge_mode, "DEDUCTED");
  assert.equal((await client.getCheckoutSession("session-1")).id, "session-1");
  assert.equal((await client.getCheckoutSessionStatus("session-1")).id, "session-1");
  assert.equal((await client.verifyPayment("payment-1")).id, "payment-1");
  assert.equal(JSON.parse(requests[0].init.body).fee_charge_mode, "DEDUCTED");
  assert.ok(requests[1].url.endsWith("/checkout-sessions/session-1/"));
});

test("the actual server client rejects a provider failure inside HTTP 200", async (t) => {
  const Client = loadSasPayClient();
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: false, data: session("DEDUCTED"), code: "error" }));
  await assert.rejects(() => new Client("server-test-key").getCheckoutSession("session-1"));
});

function harness(t, { creationMode, detailMode, reused = false, detailThrows = false, creationThrows = false, cancellationThrows = false, saved = true, orderStatus = "pending", user = true } = {}) {
  const previousEnv = { ...process.env };
  process.env.PAYMENT_MODE = "saspay";
  process.env.SASPAY_API_KEY = "test-key";
  process.env.SASPAY_WEBHOOK_SECRET = "test-secret";
  t.after(() => { process.env = previousEnv; });
  const previousInfo = console.info;
  const previousWarn = console.warn;
  const diagnostics = [];
  console.info = console.warn = (...args) => diagnostics.push(args);
  t.after(() => { console.info = previousInfo; console.warn = previousWarn; });
  const calls = [];
  const updates = [];
  const order = { id: "order-1", buyer_id: "buyer-1", amount: 1200, currency: "EUR", status: orderStatus, provider_marker: "A12345678901", product_slug: "product", ...(reused ? { provider_session_id: "session-1", provider_checkout_url: session().checkout_url, fee_charge_mode: "DEDUCTED" } : {}) };
  const admin = {
    from(table) {
      calls.push(table);
      const builder = {
        select() { return this; }, eq() { return this; },
        update(values) { updates.push(values); this.updated = true; return this; },
        async maybeSingle() {
          return { error: null, data: table === "products"
            ? { id: "product-1", slug: "product", title: "Produit", creator_id: "creator-1", amount: 1200, currency: "EUR", published: true }
            : this.updated ? saved ? { id: "order-1" } : null : order };
        },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return builder;
    },
    async rpc(name) { calls.push(name); return { error: null, data: [order] }; },
  };
  class MockProvider {
    async createCheckout() { calls.push("create"); if (creationThrows) throw new Error("private provider error"); return session(creationMode); }
    async getCheckoutSession() { calls.push("detail"); if (detailThrows) throw new Error("private provider error"); return session(detailMode); }
    async cancelCheckoutSession() { calls.push("cancel"); if (cancellationThrows) throw new Error("cancel failed"); return {}; }
  }
  const route = loadRoute({
    "@/lib/payment/accounting.mjs": accounting,
    "@/lib/payment/fx": { getUsdRate: async () => ({ rate: 1.1, date: "2026-10-07" }) },
    "@/lib/payment/server-provider": { SasPayPaymentProvider: MockProvider },
    "@/lib/payment/saspay-checkout.mjs": checkout,
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/supabase/server": { getSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: "buyer-1", email: "buyer@example.com" } : null } }) } }) },
  });
  const request = new Request("https://sellow.fun/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://sellow.fun" }, body: JSON.stringify({ slug: "product", idempotencyKey: "unique-checkout-key" }) });
  return { run: () => route.POST(request), calls, updates, diagnostics };
}

test("real checkout handler resolves a missing mode, saves the session and redirects without granting access", async (t) => {
  const h = harness(t, { detailMode: "DEDUCTED" });
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checkoutUrl, session().checkout_url);
  assert.equal(h.updates[0].fee_charge_mode, "DEDUCTED");
  assert.equal(h.updates[0].provider_session_id, "session-1");
  assert.ok(!h.calls.includes("entitlements"));
  assert.deepEqual(h.calls.filter((v) => ["create", "detail", "cancel"].includes(v)), ["create", "detail"]);
});

test("real handler blocks an unknown mode and retains the session for diagnosis and retry", async (t) => {
  const h = harness(t, { detailThrows: true });
  const response = await h.run();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: checkout.CHECKOUT_UNAVAILABLE_MESSAGE });
  assert.equal(h.updates[0].provider_status, "FEE_MODE_UNCONFIRMED");
  assert.equal(h.updates[0].provider_session_id, "session-1");
  assert.equal(h.updates[0].status, undefined);
  assert.ok(!h.calls.includes("cancel"));
  assert.ok(!h.calls.includes("entitlements"));
  assert.ok(!JSON.stringify(h.diagnostics).includes("private provider error"));
});

test("real handler cancels an explicit incompatible session and never grants access", async (t) => {
  const h = harness(t, { creationMode: "ADD_ON", detailMode: "ADD_ON" });
  assert.equal((await h.run()).status, 503);
  assert.ok(h.calls.includes("cancel"));
  assert.equal(h.updates[0].status, "canceled");
  assert.equal(h.updates[0].provider_status, "FEE_MODE_MISMATCH");
  assert.ok(!h.calls.includes("entitlements"));
});

test("failed cancellation retains an incompatible session as pending for a verified retry", async (t) => {
  const h = harness(t, { creationMode: "ADD_ON", detailMode: "ADD_ON", cancellationThrows: true });
  assert.equal((await h.run()).status, 503);
  assert.equal(h.updates[0].status, undefined);
  assert.equal(h.updates[0].provider_session_id, "session-1");
});

test("real handler rechecks a stored URL and refuses an unknown current mode", async (t) => {
  const h = harness(t, { reused: true });
  assert.equal((await h.run()).status, 503);
  assert.ok(!h.calls.includes("create"));
  assert.ok(h.calls.includes("detail"));
  assert.ok(!h.calls.includes("entitlements"));
});

test("already paid orders never redirect to another checkout", async (t) => {
  const h = harness(t, { reused: true, orderStatus: "paid" });
  const response = await h.run();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.checkoutUrl, undefined);
  assert.equal(body.order.checkoutUrl, undefined);
  assert.ok(!h.calls.includes("create"));
});

test("a session that could not be persisted cannot redirect", async (t) => {
  const h = harness(t, { creationMode: "DEDUCTED", saved: false });
  const response = await h.run();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).checkoutUrl, undefined);
});

test("creation failures remain neutral", async (t) => {
  const h = harness(t, { creationThrows: true });
  const response = await h.run();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: checkout.CHECKOUT_UNAVAILABLE_MESSAGE });
});

test("unauthenticated buyers never create a SasPay session", async (t) => {
  const h = harness(t, { user: false });
  assert.equal((await h.run()).status, 401);
  assert.equal(h.calls.length, 0);
});

test("the operational diagnostic creates only an unpaid test session, verifies it and cancels it", async () => {
  const calls = [];
  const result = await diagnoseSasPayCheckout({
    apiKey: "server-test-secret",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ success: true, data: url.endsWith("/cancel/") ? {} : session(calls.length === 1 ? undefined : "DEDUCTED"), code: "ok" });
    },
  });
  assert.equal(result.outcome, "CONFIRMED");
  assert.equal(result.cancellation, "confirmed");
  assert.equal(calls.length, 3);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.fee_charge_mode, "DEDUCTED");
  assert.equal(payload.metadata.no_purchase, true);
  assert.ok(!payload.description.match(/Sellow\s+#[A-Z0-9]{12}/));
  assert.ok(!JSON.stringify(result).includes("server-test-secret"));
  assert.ok(!JSON.stringify(result).includes("example.com"));
});
