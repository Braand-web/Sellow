import { NextResponse } from "next/server";
import { SasPayPaymentProvider } from "@/lib/payment/server-provider";
import { finalizeSasPayPayment } from "@/lib/payment/settlement";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  if (!orderId) return NextResponse.redirect(new URL("/bibliotheque?paiement=introuvable", appUrl));

  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!authData.user || !admin) return NextResponse.redirect(new URL("/connexion?next=%2Fbibliotheque", appUrl));

  const { data: order } = await admin.from("orders")
    .select("id, buyer_id, product_slug, provider_session_id, status")
    .eq("id", orderId)
    .eq("buyer_id", authData.user.id)
    .eq("provider", "saspay")
    .maybeSingle();
  if (!order) return NextResponse.redirect(new URL("/bibliotheque?paiement=introuvable", appUrl));

  if (order.status !== "paid" && order.provider_session_id) {
    try {
      const client = new SasPayPaymentProvider();
      const session = await client.getCheckoutSessionStatus(String(order.provider_session_id));
      if (session.transaction_id && session.transaction_status === "SUCCESS") {
        const payment = await client.verifyPayment(session.transaction_id);
        await finalizeSasPayPayment({
          admin,
          payment,
          eventKey: `return:${payment.id}`,
          eventType: "transaction.success",
          expectedOrderId: String(order.id),
          sanitizedPayload: { id: payment.id, reference: payment.reference, status: payment.status },
        });
      }
    } catch {
      // The webhook remains authoritative and will reconcile a successful payment.
    }
  }

  return NextResponse.redirect(new URL(`/checkout/${encodeURIComponent(String(order.product_slug))}?order=${encodeURIComponent(String(order.id))}`, appUrl));
}
