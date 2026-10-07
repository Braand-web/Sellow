import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serializeTrackedOrder, trackedOrder } from "@/lib/checkout-identity";
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const admin = getSupabaseAdmin();
  const tracked = admin && await trackedOrder(admin, request, orderId);
  if (!tracked) return NextResponse.json({ error: "Commande introuvable. Retrouvez vos achats avec votre adresse e-mail." }, { status: 404 });
  return NextResponse.json({ order: serializeTrackedOrder(tracked.order!, tracked.buyer) }, { headers: { "Cache-Control": "private, no-store" } });
}
