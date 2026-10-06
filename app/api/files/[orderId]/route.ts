import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { orderBelongsToBuyer } from "@/lib/order-access.mjs";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  void request;
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  if (!authData.user) return NextResponse.json({ error: "Connectez-vous pour télécharger ce fichier." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Le stockage Supabase n’est pas configuré." }, { status: 503 });

  const { orderId } = await params;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: order } = await supabase
    .from("orders")
    .select("id, product_id, status, buyer_id")
    .eq("id", orderId)
    .in("status", ["paid_demo", "paid"])
    .maybeSingle();
  if (!order || !orderBelongsToBuyer(order.buyer_id, authData.user.id)) return NextResponse.json({ error: "Cette commande ne donne pas accès au fichier." }, { status: 404 });

  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("id")
    .eq("order_id", order.id)
    .eq("product_id", order.product_id)
    .eq("buyer_id", authData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!entitlement) return NextResponse.json({ error: "L’accès à ce produit n’est plus actif." }, { status: 403 });

  const { data: product } = await supabase
    .from("products")
    .select("file_path, file_name")
    .eq("id", order.product_id)
    .maybeSingle();
  if (!product?.file_path) return NextResponse.json({ error: "Aucun fichier n’est associé à ce produit." }, { status: 404 });

  const { data: file, error } = await supabase.storage
    .from("product-files")
    .createSignedUrl(product.file_path, 90, { download: product.file_name || true });
  if (error || !file?.signedUrl) return NextResponse.json({ error: "Le lien de téléchargement n’a pas pu être créé." }, { status: 500 });

  return NextResponse.redirect(file.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
