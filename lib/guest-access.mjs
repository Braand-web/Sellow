import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE = "sellow_checkout";
export const GUEST_SESSION_SECONDS = 7 * 24 * 60 * 60;
export function normalizeBuyerEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function tokenHash(value) { return createHash("sha256").update(value).digest("hex"); }
export function newGuestSecret() { return randomBytes(32).toString("base64url"); }
export function guestCookieSecret(cookieHeader) {
  const value = (cookieHeader ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function guestSessionMatches(session, secret, now = Date.now()) {
  if (!session || !secret || !/^[a-f0-9]{64}$/.test(session.token_hash ?? "") || new Date(session.expires_at).getTime() <= now || !Number.isFinite(new Date(session.expires_at).getTime())) return false;
  return timingSafeEqual(Buffer.from(session.token_hash, "hex"), Buffer.from(tokenHash(secret), "hex"));
}
export function orderCanBeTracked(order, userId, guestSessionId) {
  if (!order) return false;
  if (userId && order.buyer_id === userId) return true;
  // The checkout cookie is only a receipt/status capability, never a content entitlement.
  return Boolean(guestSessionId && order.purchase_identity === "guest" && order.guest_session_id === guestSessionId);
}
export function purchaseDestination(order) {
  if (order.productKind === "course") return `/apprendre/${encodeURIComponent(order.productSlug)}`;
  return `/contenu/${encodeURIComponent(order.id)}${order.productKind === "download" ? "?telecharger=1" : ""}`;
}
export function safeRecoveryNext(value) {
  return typeof value === "string" && /^\/(bibliotheque(?:\?|$)|checkout\/[^/?]+(?:\?|$)|contenu\/[^/?]+(?:\?|$)|apprendre\/[^/?]+(?:\?|$))/.test(value) && !value.includes("\\") ? value : "/bibliotheque";
}
