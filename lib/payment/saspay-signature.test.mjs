import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifySasPaySignature } from "./saspay-signature.mjs";

test("verifies SasPay HMAC over timestamp and the exact raw body", () => {
  const secret = "server-only-test-secret";
  const timestamp = "1791300000";
  const rawBody = '{"event":"transaction.success","data":{"id":"txn-1"}}';
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  assert.equal(verifySasPaySignature({ rawBody, signature, timestamp, secret, nowSeconds: 1791300000 }), true);
  assert.equal(verifySasPaySignature({ rawBody: `${rawBody} `, signature, timestamp, secret, nowSeconds: 1791300000 }), false);
});

test("rejects stale, malformed and incorrect webhook signatures", () => {
  const args = { rawBody: "{}", signature: "0".repeat(64), timestamp: "1791300000", secret: "secret", nowSeconds: 1791300000 };
  assert.equal(verifySasPaySignature({ ...args, nowSeconds: 1791300400 }), false);
  assert.equal(verifySasPaySignature({ ...args, signature: "not-hex" }), false);
  assert.equal(verifySasPaySignature({ ...args, timestamp: "-1" }), false);
});
