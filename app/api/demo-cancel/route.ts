import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { orderBelongsToBuyer } from "@/lib/order-access.mjs";

const demoEnabled = process.env.DEMO_CHECKOUT_ENABLED === "true" || process.env.NODE_ENV !== "production";

export async function POST(request: Request) {
  if (!demoEnabled) return NextResponse.json({ error: "Les abonnements de démonstration sont désactivés." }, { status: 403 });
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  if (!authData.user) return NextResponse.json({ error: "Connectez-vous pour gérer cet abonnement." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Ce service est temporairement indisponible. Réessayez plus tard." }, { status: 503 });

  let body: { orderId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "La demande d’annulation est invalide." }, { status: 400 }); }
  if (!body.orderId) return NextResponse.json({ error: "Lien d’abonnement invalide." }, { status: 401 });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: order } = await supabase.from("orders").select("id, buyer_id, product_kind, status").eq("id", body.orderId).maybeSingle();
  if (!order || !orderBelongsToBuyer(order.buyer_id, authData.user.id) || order.product_kind !== "membership") return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 });
  if (order.status !== "canceled_demo") {
    if (order.status !== "paid_demo") return NextResponse.json({ error: "Cet abonnement ne peut plus être modifié." }, { status: 409 });
    const { error } = await supabase.from("orders").update({ status: "canceled_demo" }).eq("id", order.id).eq("buyer_id", authData.user.id);
    if (error) return NextResponse.json({ error: "L’annulation n’a pas pu être enregistrée." }, { status: 500 });
  }
  const { error: entitlementError } = await supabase.from("entitlements").update({ active: false }).eq("order_id", order.id).eq("buyer_id", authData.user.id);
  if (entitlementError) return NextResponse.json({ error: "L’abonnement est annulé, mais la fermeture de l’accès n’a pas pu être confirmée. Réessayez." }, { status: 500 });
  return NextResponse.json({ status: "canceled_demo" });
}
