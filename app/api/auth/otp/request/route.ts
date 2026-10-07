import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { consumeRateLimit, sameOrigin, trackedOrder } from "@/lib/checkout-identity";
import { normalizeBuyerEmail } from "@/lib/guest-access.mjs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  if (process.env.EMAIL_OTP_ENABLED !== "true") return NextResponse.json({ error: "La connexion par e-mail est temporairement indisponible." }, { status: 503 });
  const admin = getSupabaseAdmin();
  const auth = await getSupabaseServerClient();
  if (!admin || !auth) return NextResponse.json({ error: "La connexion par e-mail est temporairement indisponible." }, { status: 503 });
  const body = await request.json().catch(() => null) as { email?: string; orderId?: string } | null;
  let email = normalizeBuyerEmail(body?.email);
  if (body?.orderId) {
    const tracked = await trackedOrder(admin, request, body.orderId);
    if (!tracked || tracked.order?.status !== "paid") return NextResponse.json({ error: "Retrouvez vos achats avec votre adresse e-mail." }, { status: 404 });
    email = normalizeBuyerEmail(tracked.order.buyer_email);
  }
  if (!email) return NextResponse.json({ error: "Saisissez une adresse e-mail valide." }, { status: 400 });
  const ipAllowed = await consumeRateLimit(admin, request, "otp-request-ip", 50, 3600);
  const emailAllowed = await consumeRateLimit(admin, request, "otp-request-email", 1, 60, email);
  if (!ipAllowed || !emailAllowed) return NextResponse.json({ error: "Patientez une minute avant de demander un nouveau code.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  const { error } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    console.warn("email.otp_request_failed", { status: error.status, code: error.code });
    // Keep the same public response for new, existing and suppressed addresses.
  }
  return NextResponse.json({ message: "Si l’adresse peut recevoir nos e-mails, un code vous sera envoyé. Vérifiez aussi vos courriers indésirables.", retryAfter: 60 }, { headers: { "Cache-Control": "no-store" } });
}
