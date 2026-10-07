import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { consumeRateLimit, sameOrigin, serializeTrackedOrder } from "@/lib/checkout-identity";
import { normalizeBuyerEmail, purchaseDestination, safeRecoveryNext } from "@/lib/guest-access.mjs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  if (process.env.EMAIL_OTP_ENABLED !== "true") return NextResponse.json({ error: "La connexion par e-mail est temporairement indisponible." }, { status: 503 });
  const admin = getSupabaseAdmin();
  const auth = await getSupabaseServerClient();
  if (!admin || !auth) return NextResponse.json({ error: "La connexion par e-mail est temporairement indisponible." }, { status: 503 });
  const body = await request.json().catch(() => null) as { email?: string; code?: string; orderId?: string; next?: string } | null;
  const email = normalizeBuyerEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6,8}$/.test(code)) return NextResponse.json({ error: "Vérifiez votre adresse e-mail et le code reçu." }, { status: 400 });
  if (!await consumeRateLimit(admin, request, "otp-verify-ip", 100, 600) || !await consumeRateLimit(admin, request, "otp-verify-email", 10, 600, email)) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans dix minutes." }, { status: 429 });
  }
  const { data, error } = await auth.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user?.email || normalizeBuyerEmail(data.user.email) !== email || !data.session) return NextResponse.json({ error: "Ce code est incorrect ou a expiré. Demandez un nouveau code." }, { status: 400 });
  // This RPC is only reached after a fresh successful OTP verification. A
  // previously confirmed account or a submitted email alone cannot claim orders.
  const { error: claimError } = await admin.rpc("claim_guest_orders", { p_buyer_id: data.user.id, p_verified_email: email });
  if (claimError) {
    console.warn("email.purchase_claim_failed", { code: claimError.code });
    return NextResponse.json({ error: "Votre adresse est vérifiée, mais vos achats n’ont pas pu être récupérés. Demandez un nouveau code dans une minute." }, { status: 503 });
  }
  let next = safeRecoveryNext(body?.next);
  let order;
  if (body?.orderId && /^[0-9a-f-]{36}$/i.test(body.orderId)) {
    const { data: row } = await admin.from("orders").select("*").eq("id", body.orderId).eq("buyer_id", data.user.id).eq("status", "paid").maybeSingle();
    if (row) { order = serializeTrackedOrder(row, true); next = purchaseDestination(order); }
  }
  return NextResponse.json({ next, order }, { headers: { "Cache-Control": "no-store" } });
}
