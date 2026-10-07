import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GUEST_COOKIE, GUEST_SESSION_SECONDS, guestCookieSecret, guestSessionMatches, newGuestSecret, orderCanBeTracked, tokenHash } from "@/lib/guest-access.mjs";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
export async function guestSession(admin: SupabaseClient, request: Request) {
  const secret = guestCookieSecret(request.headers.get("cookie"));
  if (!secret) return null;
  const { data } = await admin.from("guest_checkout_sessions").select("id, token_hash, expires_at").eq("token_hash", tokenHash(secret)).maybeSingle();
  return guestSessionMatches(data, secret) ? data : null;
}
export async function ensureGuestSession(admin: SupabaseClient, request: Request) {
  const prior = await guestSession(admin, request);
  if (prior) return prior;
  const secret = newGuestSecret();
  const { data, error } = await admin.from("guest_checkout_sessions").insert({ token_hash: tokenHash(secret), expires_at: new Date(Date.now() + GUEST_SESSION_SECONDS * 1000).toISOString() }).select("id, token_hash, expires_at").single();
  if (error || !data) throw new Error("Le paiement est temporairement indisponible. Réessayez plus tard.");
  (await cookies()).set(GUEST_COOKIE, secret, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GUEST_SESSION_SECONDS });
  return data;
}
export async function trackedOrder(admin: SupabaseClient, request: Request, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const auth = await getSupabaseServerClient();
  const { data } = auth ? await auth.auth.getUser() : { data: { user: null } };
  const session = await guestSession(admin, request);
  if (!data.user && !session) return null;
  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  return orderCanBeTracked(order, data.user?.id, session?.id) ? { order, buyer: Boolean(data.user && order?.buyer_id === data.user.id) } : null;
}
export function serializeTrackedOrder(row: Record<string, unknown>, isBuyer = false) {
  return {
    id: String(row.id), buyerId: isBuyer && row.buyer_id ? String(row.buyer_id) : undefined,
    productId: String(row.product_id), productSlug: String(row.product_slug), productTitle: String(row.product_title), productKind: String(row.product_kind),
    creatorName: String(row.creator_name), creatorSlug: String(row.creator_slug), buyerEmail: String(row.buyer_email),
    status: String(row.status), amount: Number(row.amount) / 100, currency: String(row.currency), createdAt: String(row.created_at),
    membershipExpiresAt: row.membership_expires_at ? String(row.membership_expires_at) : undefined,
    shippingAddress: isBuyer && row.shipping_address ? String(row.shipping_address) : undefined,
    buyerNote: isBuyer && row.buyer_note ? String(row.buyer_note) : undefined,
    requiresEmailVerification: row.purchase_identity === "guest" && !isBuyer,
    isRemote: true,
  };
}
export async function consumeRateLimit(admin: SupabaseClient, request: Request, action: string, limit: number, seconds: number, identity?: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { data, error } = await admin.rpc("consume_sellow_rate_limit", { p_key: tokenHash(`${action}:${identity ?? ip}`), p_limit: limit, p_window_seconds: seconds });
  return !error && data === true;
}
