import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!authData.user || !admin) return NextResponse.json({ error: "Connectez-vous pour gérer cet abonnement." }, { status: 401 });

  let body: { orderId?: string };
  try { body = await request.json() as { orderId?: string }; }
  catch { return NextResponse.json({ error: "La demande est invalide." }, { status: 400 }); }
  if (!body.orderId) return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 });

  const { data: order } = await admin.from("orders")
    .select("id, buyer_id, product_kind, status, membership_expires_at, membership_renewal_cancelled_at")
    .eq("id", body.orderId)
    .eq("buyer_id", authData.user.id)
    .eq("provider", "saspay")
    .maybeSingle();
  if (!order || order.product_kind !== "membership" || order.status !== "paid") return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 });
  if (order.membership_renewal_cancelled_at) return NextResponse.json({ cancelledAt: String(order.membership_renewal_cancelled_at) });
  if (!order.membership_expires_at || new Date(order.membership_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Cet accès est déjà arrivé à échéance." }, { status: 409 });
  }

  const cancelledAt = new Date().toISOString();
  const { error } = await admin.from("orders").update({ membership_renewal_cancelled_at: cancelledAt })
    .eq("id", order.id).eq("buyer_id", authData.user.id).is("membership_renewal_cancelled_at", null);
  if (error) return NextResponse.json({ error: "La demande d’arrêt du renouvellement n’a pas pu être enregistrée." }, { status: 500 });
  return NextResponse.json({ cancelledAt });
}
