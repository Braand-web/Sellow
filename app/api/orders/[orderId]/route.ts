import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!authData.user || !admin) return NextResponse.json({ error: "Connectez-vous pour consulter cette commande." }, { status: 401 });
  const { data: row, error } = await admin.from("orders").select("*").eq("id", orderId).eq("buyer_id", authData.user.id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  return NextResponse.json({
    order: {
      id: String(row.id),
      buyerId: String(row.buyer_id),
      productId: String(row.product_id),
      productSlug: String(row.product_slug),
      productTitle: String(row.product_title),
      productKind: String(row.product_kind),
      creatorName: String(row.creator_name),
      creatorSlug: String(row.creator_slug),
      buyerEmail: String(row.buyer_email),
      status: String(row.status),
      amount: Number(row.amount) / 100,
      currency: String(row.currency),
      createdAt: String(row.created_at),
      membershipExpiresAt: row.membership_expires_at ? String(row.membership_expires_at) : undefined,
      isRemote: true,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
