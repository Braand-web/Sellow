import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { messageNotification } from "./messaging.mjs";
import { emailRetry } from "./purchase-email.mjs";
const ts = createRequire(import.meta.url)("typescript");
const id = "20000000-0000-4000-8000-000000000001";
function worker({
  jobs = [{ id, locked_until: "lease", attempts: 1 }],
  recipient = { email: "buyer@example.com", conversation_id: id },
  sendStatus = 200,
  saveError = null,
} = {}) {
  let handler;
  const sends = [],
    calls = [],
    changes = [];
  const admin = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === "lease_message_notifications"
        ? { data: jobs }
        : name === "prepare_message_notification"
          ? { data: recipient }
          : { data: true, error: saveError };
    },
    from(table) {
      return {
        update(value) {
          changes.push({ table, value });
          return this;
        },
        select() {
          return this;
        },
        is() {
          return this;
        },
        lt() {
          return this;
        },
        eq() {
          return this;
        },
        limit: async () => ({ data: [] }),
        then(resolve) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(
      new URL(
        "../supabase/functions/message-notifications/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", "Deno", "fetch", compiled)(
    (name) =>
      name.startsWith("npm:")
        ? { createClient: () => admin }
        : name.includes("messaging")
          ? { messageNotification }
          : { emailRetry },
    result,
    result.exports,
    {
      serve: (fn) => {
        handler = fn;
      },
      env: {
        get: (name) =>
          ({
            EMAIL_WORKER_SECRET: "worker-secret",
            RESEND_API_KEY: "private-key",
            SUPABASE_SERVICE_ROLE_KEY: "service-secret",
            SUPABASE_URL: "https://test.supabase.co",
          })[name],
      },
    },
    async (url, init) => {
      sends.push({ url, init });
      return Response.json(
        sendStatus === 200
          ? { id: "message-id" }
          : { error: "provider-private-detail" },
        { status: sendStatus },
      );
    },
  );
  return { handler, sends, calls, changes };
}
const request = (secret = "worker-secret", body = {}) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "x-worker-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("message worker authenticates before loading or sending anything", async () => {
  const w = worker();
  for (const key of ["", "forged-secret"])
    assert.equal((await w.handler(request(key))).status, 403);
  assert.equal(w.calls.length, 0);
  assert.equal(w.sends.length, 0);
});
test("message worker rechecks unread status and sends no private message data", async () => {
  const w = worker();
  assert.equal((await w.handler(request())).status, 200);
  assert.equal(w.sends.length, 1);
  const sent = JSON.parse(w.sends[0].init.body);
  assert.equal(sent.from, "Sellow <messages@notifications.sellow.fun>");
  assert.deepEqual(sent.to, ["buyer@example.com"]);
  assert.match(sent.text, /\/messages\//);
  assert.doesNotMatch(
    w.sends[0].init.body,
    /service-secret|private-key|provider|attachments|body_private/,
  );
  assert.equal(w.calls[1].name, "prepare_message_notification");
  assert.equal(w.calls[2].name, "finish_message_notification");
});
test("read, blocked and muted batches do not send", async () => {
  const w = worker({ recipient: null });
  await w.handler(request());
  assert.equal(w.sends.length, 0);
  assert.equal(w.calls.length, 2);
});
test("network retries retain the same email idempotency key and never change orders", async () => {
  const w = worker({ sendStatus: 500 });
  await w.handler(request());
  await w.handler(request());
  assert.equal(
    w.sends[0].init.headers["Idempotency-Key"],
    w.sends[1].init.headers["Idempotency-Key"],
  );
  assert.equal(w.changes[0].table, "message_notification_outbox");
  assert.equal(w.changes[0].value.status, "pending");
  assert.ok(w.changes.every((c) => c.table !== "orders"));
  assert.doesNotMatch(JSON.stringify(w.changes), /provider-private-detail/);
});
test("delivery probe uses a fixed simulator recipient without any chat mutation", async () => {
  const w = worker();
  const response = await w.handler(
    request("worker-secret", {
      action: "check-delivery",
      testId: id,
      recipient: "attacker@evil.test",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(w.sends[0].init.body).to, [
    "delivered@resend.dev",
  ]);
  assert.equal(w.calls.length, 0);
  assert.equal(w.changes.length, 0);
});
