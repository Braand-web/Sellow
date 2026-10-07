import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { receiptMessage, emailRetry } from "./purchase-email.mjs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function worker({ jobs = [], sendStatus = 200 } = {}) {
  let handler;
  const changes = [];
  const sends = [];
  const admin = {
    from(table) {
      return { update(value) { changes.push({ table, value }); return this; }, delete() { return this; }, select() { return this; }, eq() { return this; }, gte() { return this; }, lt() { return Promise.resolve({ error: null }); },
        single: async () => ({ error: null, data: { id: "order", amount: 1200, currency: "EUR", product_title: "Cours", product_kind: "course", status: "paid" } }),
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
    },
    rpc: async () => ({ data: jobs, error: null }),
  };
  const result = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL("../supabase/functions/purchase-emails/index.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", "Deno", "fetch", compiled)((name) => name.startsWith("npm:") ? { createClient: () => admin } : { receiptMessage, emailRetry }, result, result.exports,
    { serve: (fn) => { handler = fn; }, env: { get: (name) => ({ EMAIL_WORKER_SECRET: "worker-secret", RESEND_API_KEY: "server-only-key", SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-role" })[name] } },
    async (url, init) => { sends.push({ url, init }); return Response.json(sendStatus === 200 ? { id: "email-id" } : { error: "private provider details" }, { status: sendStatus }); });
  return { handler, changes, sends };
}
test("receipt worker rejects absent or forged secrets before reading orders", async () => {
  const h = worker();
  for (const secret of ["", "forged-secret"]) assert.equal((await h.handler(new Request("https://example.test", { method: "POST", headers: { "x-worker-secret": secret } }))).status, 403);
  assert.equal(h.changes.length, 0);
  assert.equal(h.sends.length, 0);
});
test("worker sends receipts with stable idempotency and no private content", async () => {
  const h = worker({ jobs: [{ id: "job", revision: 0, order_id: "order", recipient: "buyer@example.com", locked_until: "lease", attempts: 1 }] });
  const request = () => new Request("https://example.test", { method: "POST", headers: { "x-worker-secret": "worker-secret" } });
  assert.equal((await h.handler(request())).status, 200);
  await h.handler(request());
  assert.equal(h.sends[0].init.headers["Idempotency-Key"], h.sends[1].init.headers["Idempotency-Key"]);
  assert.doesNotMatch(h.sends[0].init.body, /server-role|server-only-key|access_token|saspay/i);
  assert.equal(h.changes.at(-1).value.status, "sent");
});
test("email failures leave payments unchanged and exhausted attempts become visible", async () => {
  const h = worker({ jobs: [{ id: "job", revision: 0, order_id: "order", recipient: "buyer@example.com", locked_until: "lease", attempts: 6 }], sendStatus: 500 });
  const response = await h.handler(new Request("https://example.test", { method: "POST", headers: { "x-worker-secret": "worker-secret" } }));
  assert.equal(response.status, 200);
  assert.equal(h.changes.at(-1).value.status, "failed");
  assert.ok(h.changes.every((item) => item.table === "email_outbox"));
  assert.doesNotMatch(JSON.stringify(h.changes), /private provider/);
});
