import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { paymentProvider } from "@/lib/payment/provider";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

const demoEnabled = process.env.DEMO_CHECKOUT_ENABLED === "true" || process.env.NODE_ENV !== "production";

export async function POST(request: Request) {
  if (!demoEnabled) {
    return NextResponse.json({ error: "Le checkout de démonstration est désactivé." }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Configurez Supabase côté serveur pour acheter ce produit." }, { status: 503 });
  }

  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const buyer = authData.user;
  if (!buyer?.email) return NextResponse.json({ error: "Connectez-vous pour acheter ce produit." }, { status: 401 });

  let body: {
    slug?: string;
    buyerEmail?: string;
    shippingAddress?: string;
    buyerNote?: string;
    idempotencyKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "La demande de checkout est invalide." }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const buyerEmail = buyer.email.trim().toLowerCase();
  const idempotencyKey = body.idempotencyKey?.trim();
  if (!slug || !buyerEmail.includes("@") || !idempotencyKey) {
    return NextResponse.json({ error: "Vérifiez le produit et l’adresse e mail." }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: priorOrder } = await supabase.from("orders").select("*").eq("idempotency_key", idempotencyKey).eq("buyer_id", buyer.id).maybeSingle();
  if (priorOrder) return NextResponse.json({ order: serializeOrder(priorOrder) });

  const { data: row, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (productError || !row) {
    return NextResponse.json({ error: "Ce produit n’est plus disponible." }, { status: 404 });
  }
  if (row.product_kind === "physical" && !body.shippingAddress?.trim()) {
    return NextResponse.json({ error: "Ajoutez une adresse de livraison." }, { status: 400 });
  }

  const product: Product = {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ""),
    description: String(row.description ?? ""),
    kind: row.product_kind as Product["kind"],
    category: String(row.category),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    price: Number(row.amount) / 100,
    currency: String(row.currency),
    creatorId: String(row.creator_id),
    creatorName: String(row.creator_name),
    creatorSlug: String(row.creator_slug),
    creatorInitials: "CR",
    creatorTone: "rose",
    cover: String(row.cover ?? "identity"),
    coverLabel: String(row.cover_label ?? "CRÉATION INDÉPENDANTE"),
    fileName: row.file_name ? String(row.file_name) : undefined,
    filePath: row.file_path ? String(row.file_path) : undefined,
    published: true,
    createdAt: String(row.created_at),
  };
  let payment;
  try {
    payment = await paymentProvider.createCheckout({
      product,
      buyerEmail,
      shippingAddress: body.shippingAddress?.trim(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Checkout indisponible." }, { status: 400 });
  }

  const orderId = randomUUID();
  const accessToken = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
  const orderRecord = {
    id: orderId,
    idempotency_key: idempotencyKey,
    access_token: accessToken,
    buyer_id: buyer.id,
    buyer_email: buyerEmail,
    product_id: row.id,
    product_slug: row.slug,
    product_title: row.title,
    product_kind: row.product_kind,
    creator_id: row.creator_id,
    creator_name: product.creatorName,
    creator_slug: product.creatorSlug,
    amount: row.amount,
    currency: row.currency,
    shipping_address: body.shippingAddress?.trim() || null,
    buyer_note: body.buyerNote?.trim() || null,
    status: payment.status,
    provider: payment.provider,
  };

  const { error: orderError } = await supabase.from("orders").insert(orderRecord);
  if (orderError) {
    const { data: concurrentOrder } = await supabase.from("orders").select("*").eq("idempotency_key", idempotencyKey).eq("buyer_id", buyer.id).maybeSingle();
    if (concurrentOrder) return NextResponse.json({ order: serializeOrder(concurrentOrder) });
    return NextResponse.json({ error: "Impossible d’enregistrer la commande de démonstration." }, { status: 500 });
  }

  const { error: entitlementError } = await supabase.from("entitlements").insert({
    order_id: orderId,
    product_id: row.id,
    buyer_id: buyer.id,
    active: true,
  });
  if (entitlementError) {
    await supabase.from("orders").delete().eq("id", orderId);
    return NextResponse.json({ error: "Impossible d’ouvrir l’accès au produit." }, { status: 500 });
  }

  return NextResponse.json({ order: serializeOrder({ ...orderRecord, created_at: new Date().toISOString() }) });
}

function serializeOrder(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    buyerId: String(row.buyer_id ?? ""),
    productId: String(row.product_id),
    productSlug: String(row.product_slug ?? ""),
    productTitle: String(row.product_title),
    productKind: String(row.product_kind),
    creatorName: String(row.creator_name ?? "Créateur indépendant"),
    creatorSlug: String(row.creator_slug ?? ""),
    buyerEmail: String(row.buyer_email),
    status: String(row.status),
    amount: Number(row.amount) / 100,
    currency: String(row.currency),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    shippingAddress: row.shipping_address ? String(row.shipping_address) : undefined,
    buyerNote: row.buyer_note ? String(row.buyer_note) : undefined,
    isRemote: true,
  };
}
