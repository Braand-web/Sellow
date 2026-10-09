import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as validation from "./messaging.mjs";
const ts = createRequire(import.meta.url)("typescript");
const ids = {
  buyer: "20000000-0000-4000-8000-000000000001",
  seller: "20000000-0000-4000-8000-000000000002",
  other: "20000000-0000-4000-8000-000000000003",
  conversation: "20000000-0000-4000-8000-000000000004",
  file: "20000000-0000-4000-8000-000000000005",
  message: "20000000-0000-4000-8000-000000000006",
  product: "20000000-0000-4000-8000-000000000007",
};
function harness({
  user = {
    id: ids.buyer,
    email_confirmed_at: "2026-10-01",
    user_metadata: { name: "Client" },
  },
  enabled = true,
  rpcError = null,
} = {}) {
  const calls = [],
    signed = [];
  let authCalls = 0;
  const records = {
    conversations: [
      {
        id: ids.conversation,
        customer_id: ids.buyer,
        seller_id: ids.seller,
        customer_name: "Client",
        seller_name: "Vendeur",
        seller_slug: "vendeur",
        created_at: "2026-10-01",
        last_message_at: "2026-10-01",
      },
    ],
    products: [{ id: ids.product, creator_id: ids.seller, published: true }],
    messages: [],
    conversation_participants: [],
    orders: [],
    message_attachments: [
      {
        id: ids.file,
        conversation_id: ids.conversation,
        message_id: ids.message,
        name: "notice.pdf",
        storage_path: "private/path",
        mime_type: "application/pdf",
      },
    ],
  };
  const admin = {
    from(table) {
      let rows = [...(records[table] ?? [])];
      return {
        select() {
          return this;
        },
        eq(k, v) {
          rows = rows.filter((r) => r[k] === v);
          return this;
        },
        or(value) {
          const id = value.split(".eq.")[1].split(",")[0];
          rows = rows.filter((r) => r.customer_id === id || r.seller_id === id);
          return this;
        },
        in(k, v) {
          rows = rows.filter((r) => v.includes(r[k]));
          return this;
        },
        is(k, v) {
          rows = rows.filter((r) => (r[k] ?? null) === v);
          return this;
        },
        not(k, _op, v) {
          rows = rows.filter((r) => (r[k] ?? null) !== v);
          return this;
        },
        gt() {
          return this;
        },
        lt() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        range(from, to) {
          rows = rows.slice(from, to + 1);
          return this;
        },
        update() {
          return this;
        },
        insert(v) {
          calls.push({ insert: table, value: v });
          return this;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then(resolve) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        error: rpcError,
        data:
          name === "send_sellow_message"
            ? { id: ids.message }
            : name === "open_sellow_conversation"
              ? records.conversations[0]
              : [],
      };
    },
    storage: {
      from() {
        return {
          createSignedUrl: async (path, seconds) => {
            signed.push({ path, seconds });
            return {
              data: { signedUrl: "https://files.example.test/temporary" },
            };
          },
          createSignedUploadUrl: async (path) => {
            signed.push({ path });
            return { data: { token: "scoped-upload-token" } };
          },
        };
      },
    },
  };
  const mocks = {
    "server-only": {},
    "next/server": {
      NextResponse: { json: (body, options) => Response.json(body, options) },
    },
    "@/lib/supabase/server": {
      getSupabaseServerClient: async () => ({
        auth: {
          getUser: async () => {
            authCalls++;
            return { data: { user } };
          },
        },
      }),
    },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/checkout-identity": {
      sameOrigin: (request) =>
        (!request.headers.get("origin") ||
          request.headers.get("origin") === new URL(request.url).origin) &&
        request.headers.get("sec-fetch-site") !== "cross-site",
      consumeRateLimit: async () => true,
    },
    "@/lib/messaging.mjs": validation,
  };
  function load(path) {
    const exports = {};
    const compiled = ts.transpileModule(
      readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    new Function("require", "module", "exports", "process", compiled)(
      (name) =>
        name === "node:crypto"
          ? createRequire(import.meta.url)(name)
          : mocks[name],
      { exports },
      exports,
      { env: { MESSAGING_ENABLED: enabled ? "true" : "false" } },
    );
    return exports;
  }
  mocks["@/lib/messaging-server"] = load("./messaging-server.ts");
  return {
    list: load("../app/api/conversations/route.ts"),
    thread: load("../app/api/conversations/[conversationId]/route.ts"),
    attachment: load(
      "../app/api/conversations/[conversationId]/attachments/route.ts",
    ),
    calls,
    signed,
    records,
    get authCalls() {
      return authCalls;
    },
  };
}
function request(method = "GET", body, extra = {}) {
  return new Request("https://sellow.fun/api/conversations", {
    method,
    headers: { "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const context = {
  params: Promise.resolve({ conversationId: ids.conversation }),
};
test("messaging API remains closed behind its server flag and rejects guest/forged sessions", async () => {
  let h = harness({ enabled: false });
  assert.equal((await h.list.GET(request())).status, 503);
  assert.equal(h.authCalls, 0);
  for (const user of [null, { id: ids.buyer, email_confirmed_at: null }]) {
    h = harness({ user });
    assert.equal(
      (
        await h.thread.GET(
          request("GET", undefined, { cookie: "sellow_guest_checkout=forged" }),
          context,
        )
      ).status,
      401,
    );
    assert.equal(h.calls.length, 0);
  }
});
test("API derives the sender and customer from verified Auth, ignores forged identity fields", async () => {
  const h = harness();
  const body = {
    body: "Bonjour",
    attachments: [],
    clientRequestId: crypto.randomUUID(),
    senderId: ids.seller,
    buyerId: ids.other,
  };
  assert.equal(
    (await h.thread.POST(request("POST", body), context)).status,
    200,
  );
  assert.equal(h.calls[0].args.p_sender, ids.buyer);
  assert.equal(
    (
      await h.list.POST(
        request("POST", {
          productId: ids.product,
          buyerId: ids.other,
          sellerId: ids.other,
        }),
      )
    ).status,
    200,
  );
  assert.equal(h.calls[1].args.p_customer, ids.buyer);
  assert.equal(h.calls[1].args.p_seller, ids.seller);
});
test("foreign buyers and cross-origin mutations cannot read, send or sign downloads", async () => {
  const h = harness({
    user: { id: ids.other, email_confirmed_at: "2026-10-01" },
  });
  assert.equal((await h.thread.GET(request(), context)).status, 404);
  assert.equal(
    (await h.thread.POST(request("POST", { body: "forged" }), context)).status,
    404,
  );
  assert.equal(
    (
      await h.attachment.GET(
        new Request(
          `https://sellow.fun/api/conversations/x/attachments?id=${ids.file}`,
        ),
        context,
      )
    ).status,
    404,
  );
  assert.equal(h.signed.length, 0);
  const origin = harness();
  assert.equal(
    (
      await origin.thread.POST(
        request("POST", {}, { origin: "https://evil.test" }),
        context,
      )
    ).status,
    403,
  );
});
test("only linked conversation attachment IDs receive a short download URL", async () => {
  const h = harness();
  let response = await h.attachment.GET(
    new Request(
      `https://sellow.fun/api/conversations/x/attachments?id=${ids.file}`,
    ),
    context,
  );
  assert.equal(response.status, 200);
  assert.equal(h.signed[0].seconds, 60);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  response = await h.attachment.GET(
    new Request(
      `https://sellow.fun/api/conversations/x/attachments?id=${ids.other}`,
    ),
    context,
  );
  assert.equal(response.status, 404);
  assert.equal(h.signed.length, 1);
});

test("the purchase summary loads all pages and stays scoped to this buyer and seller", async () => {
  const h = harness();
  h.records.orders = Array.from({ length: 1005 }, (_, index) => ({
    id: crypto.randomUUID(), buyer_id: ids.buyer, creator_id: ids.seller,
    status: 'paid', amount: 1200, currency: 'EUR', product_title: `Achat ${index}`,
  }));
  h.records.orders.push({ id: crypto.randomUUID(), buyer_id: ids.other, creator_id: ids.seller, status: 'paid', amount: 1200 });
  const response = await h.thread.GET(request(), context);
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.summary.paidCount, 1005);
  assert.equal(detail.summary.purchases[0].amount, 12);
});
test("invalid files, text and provider failures expose only neutral public errors", async () => {
  const h = harness();
  assert.equal(
    (
      await h.attachment.POST(
        request("POST", {
          name: "evil.html",
          mimeType: "text/html",
          size: 100,
        }),
        context,
      )
    ).status,
    400,
  );
  assert.equal(h.signed.length, 0);
  assert.equal(
    (
      await h.thread.POST(
        request("POST", {
          body: "x".repeat(4001),
          attachments: [],
          clientRequestId: crypto.randomUUID(),
        }),
        context,
      )
    ).status,
    400,
  );
  const unavailable = harness({
    rpcError: { message: "private saspay diagnostic" },
  });
  const response = await unavailable.thread.POST(
    request("POST", {
      body: "Bonjour",
      attachments: [],
      clientRequestId: crypto.randomUUID(),
    }),
    context,
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /saspay|diagnostic/i);
});
