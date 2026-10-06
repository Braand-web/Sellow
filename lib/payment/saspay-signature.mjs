import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySasPaySignature({ rawBody, signature, timestamp, secret, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!signature || !timestamp || !/^\d{1,12}$/.test(timestamp) || !secret) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) return false;
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}
