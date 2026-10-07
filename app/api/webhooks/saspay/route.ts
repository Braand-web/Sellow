import { NextResponse } from "next/server";
import { getSasPayWebhookSecret } from "@/lib/payment/saspay";
import { verifySasPaySignature } from "@/lib/payment/saspay-signature.mjs";
import { SasPayPaymentProvider } from "@/lib/payment/server-provider";
import { finalizeSasPayPayment, sanitizedSasPayPayload } from "@/lib/payment/settlement";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = getSasPayWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  if (!verifySasPaySignature({ rawBody, signature, timestamp, secret })) {
    return NextResponse.json({ error: "Signature du webhook invalide." }, { status: 401 });
  }

  let payload: { event?: unknown; data?: Record<string, unknown> };
  try { payload = JSON.parse(rawBody) as typeof payload; }
  catch { return NextResponse.json({ error: "Corps du webhook invalide." }, { status: 400 }); }
  const headerEvent = request.headers.get("x-webhook-event");
  const event = typeof payload.event === "string" ? payload.event : "";
  if (!event || headerEvent !== event) return NextResponse.json({ error: "Type de webhook incohérent." }, { status: 400 });
  if (event === "webhook.test") return NextResponse.json({ received: true });
  if (!["transaction.success", "transaction.failed", "transaction.cancelled"].includes(event)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const providerTransactionId = String(payload.data?.id ?? "");
  if (!providerTransactionId) return NextResponse.json({ error: "Identifiant de transaction manquant." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Ce service est temporairement indisponible. Réessayez plus tard." }, { status: 503 });

  try {
    const payment = await new SasPayPaymentProvider().verifyPayment(providerTransactionId);
    if (payment.id !== providerTransactionId) throw new Error("La transaction vérifiée ne correspond pas au webhook.");
    const verified = await finalizeSasPayPayment({
      admin,
      payment,
      eventKey: `${event}:${providerTransactionId}`,
      eventType: event,
      sanitizedPayload: sanitizedSasPayPayload(payload.data ?? {}),
    });
    return NextResponse.json({ received: true, duplicate: verified.duplicate });
  } catch {
    return NextResponse.json({ error: "La transaction n’a pas pu être vérifiée." }, { status: 503 });
  }
}
