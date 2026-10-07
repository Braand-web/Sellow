import { NextResponse } from "next/server";
import { SasPayPaymentProvider } from "@/lib/payment/server-provider";
import { finalizeSasPayPayment } from "@/lib/payment/settlement";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeRateLimit, sameOrigin, trackedOrder } from "@/lib/checkout-identity";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  const admin = getSupabaseAdmin();
  const tracked = admin && await trackedOrder(admin, request, orderId);
  if (!tracked || !admin || tracked.order?.provider !== "saspay") return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  if (!await consumeRateLimit(admin, request, "payment-verify", 30, 60, orderId)) return NextResponse.json({ error: "La vérification est en cours. Réessayez dans un instant." }, { status: 429 });
  const order = tracked.order;
  if (order.status === "paid") return NextResponse.json({ status: "paid" });
  if (!order.provider_session_id) return NextResponse.json({ error: "La session de paiement est introuvable." }, { status: 409 });

  try {
    const client = new SasPayPaymentProvider();
    const session = await client.getCheckoutSessionStatus(String(order.provider_session_id));
    if (!session.transaction_id) return NextResponse.json({ status: "pending" });
    const payment = await client.verifyPayment(session.transaction_id);
    const eventType = payment.status.toUpperCase() === "FAILED" ? "transaction.failed"
      : payment.status.toUpperCase() === "CANCELLED" ? "transaction.cancelled" : "transaction.success";
    const result = await finalizeSasPayPayment({
      admin,
      payment,
      eventKey: `check:${payment.id}:${payment.status.toUpperCase()}`,
      eventType,
      expectedOrderId: String(order.id),
      sanitizedPayload: { id: payment.id, reference: payment.reference, status: payment.status },
    });
    return NextResponse.json({ status: result.status === "SUCCESS" ? "paid" : result.status.toLowerCase() });
  } catch {
    return NextResponse.json({ error: "L’état du paiement n’a pas pu être vérifié. Réessayez." }, { status: 503 });
  }
}
