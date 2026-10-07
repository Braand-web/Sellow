import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currencyFractionDigits } from "@/lib/payment/accounting.mjs";
import { getUsdRate } from "@/lib/payment/fx";
import { SasPayPaymentProvider } from "@/lib/payment/server-provider";
import { checkSasPayCheckout, CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/payment/saspay-checkout.mjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

type CheckoutBody = {
  slug?: string;
  buyerEmail?: string;
  shippingAddress?: string;
  buyerNote?: string;
  idempotencyKey?: string;
};

const publicOrder = (row: Record<string, unknown>, checkoutUrl?: string) => ({
  id: String(row.id),
  buyerId: row.buyer_id ? String(row.buyer_id) : undefined,
  productId: String(row.product_id),
  productSlug: String(row.product_slug ?? ""),
  productTitle: String(row.product_title ?? ""),
  productKind: String(row.product_kind ?? "download"),
  creatorName: String(row.creator_name ?? "Créateur indépendant"),
  creatorSlug: String(row.creator_slug ?? ""),
  buyerEmail: String(row.buyer_email ?? ""),
  status: String(row.status ?? "pending"),
  amount: Number(row.amount ?? 0) / 100,
  currency: String(row.currency ?? "EUR"),
  createdAt: String(row.created_at ?? new Date().toISOString()),
  membershipExpiresAt: row.membership_expires_at ? String(row.membership_expires_at) : undefined,
  ...(checkoutUrl ? { checkoutUrl } : {}),
  isRemote: true,
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function productFromRow(row: Record<string, unknown>): Product {
  const creatorName = String(row.creator_name ?? "Créateur indépendant");
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ""),
    description: String(row.description ?? ""),
    kind: String(row.product_kind ?? "download") as Product["kind"],
    category: String(row.category ?? "Autre"),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    price: Number(row.amount ?? 0) / 100,
    currency: String(row.currency ?? "EUR"),
    creatorId: String(row.creator_id),
    creatorName,
    creatorSlug: String(row.creator_slug ?? ""),
    creatorInitials: creatorName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    creatorTone: "rose",
    cover: String(row.cover ?? "identity"),
    coverLabel: String(row.cover_label ?? "CRÉATION INDÉPENDANTE"),
    fileName: row.file_name ? String(row.file_name) : undefined,
    filePath: row.file_path ? String(row.file_path) : undefined,
    published: Boolean(row.published),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase côté serveur n’est pas configuré." }, { status: 503 });

  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const buyer = authData.user;
  if (!buyer?.email) return NextResponse.json({ error: "Connectez-vous pour acheter ce produit." }, { status: 401 });

  let body: CheckoutBody;
  try { body = await request.json() as CheckoutBody; }
  catch { return NextResponse.json({ error: "La demande de checkout est invalide." }, { status: 400 }); }

  const slug = body.slug?.trim();
  const buyerEmail = buyer.email.trim().toLowerCase();
  const idempotencyKey = body.idempotencyKey?.trim();
  if (!slug || !idempotencyKey || idempotencyKey.length < 16 || !buyerEmail.includes("@")) {
    return NextResponse.json({ error: "Vérifiez le produit, l’adresse e mail et la référence de commande." }, { status: 400 });
  }

  const { data: row, error: productError } = await admin.from("products")
    .select("*").eq("slug", slug).eq("published", true).maybeSingle();
  if (productError || !row) return NextResponse.json({ error: "Ce produit n’est plus disponible." }, { status: 404 });
  if (row.product_kind === "physical" && !body.shippingAddress?.trim()) {
    return NextResponse.json({ error: "Ajoutez une adresse de livraison." }, { status: 400 });
  }
  const product = productFromRow(row as Record<string, unknown>);

  const mode = process.env.PAYMENT_MODE ?? (process.env.NODE_ENV === "production" ? "disabled" : "demo");
  if (mode === "saspay") {
    if (!process.env.SASPAY_API_KEY || !process.env.SASPAY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Le checkout SasPay n’est pas encore entièrement configuré. Réessayez plus tard." }, { status: 503 });
    }
    if (currencyFractionDigits(product.currency) > 2) {
      return NextResponse.json({ error: "Cette devise demande une précision que le catalogue ne permet pas encore." }, { status: 422 });
    }

    let fx;
    try { fx = await getUsdRate(product.currency); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "La conversion de devise est indisponible." }, { status: 503 }); }

    const { data: prepared, error: prepareError } = await admin.rpc("prepare_saspay_order", {
      p_idempotency_key: idempotencyKey,
      p_access_token: `${randomUUID()}${randomUUID().replaceAll("-", "")}`,
      p_buyer_id: buyer.id,
      p_buyer_email: buyerEmail,
      p_product_slug: slug,
      p_shipping_address: body.shippingAddress?.trim() ?? "",
      p_buyer_note: body.buyerNote?.trim() ?? "",
      p_fx_rate: fx.rate,
      p_fx_date: fx.date,
      p_currency_exponent: currencyFractionDigits(product.currency),
    });
    if (prepareError) {
      const message = prepareError.message.includes("creator cannot purchase")
        ? "Vous ne pouvez pas acheter votre propre produit."
        : prepareError.message.includes("product unavailable")
          ? "Ce produit n’est plus disponible."
          : "La commande n’a pas pu être préparée.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const orderRow = (Array.isArray(prepared) ? prepared[0] : prepared) as Record<string, unknown> | null;
    if (!orderRow) return NextResponse.json({ error: "La commande n’a pas pu être préparée." }, { status: 500 });
    if (orderRow.status === "paid") {
      return NextResponse.json({ order: publicOrder(orderRow) });
    }

    try {
      const client = new SasPayPaymentProvider();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      const existingSessionId = typeof orderRow.provider_session_id === "string" && orderRow.provider_session_id.trim()
        ? orderRow.provider_session_id : undefined;
      const session = existingSessionId ? {
        id: existingSessionId,
        checkout_url: orderRow.provider_checkout_url,
        status: "PENDING",
      } : await client.createCheckout({
        orderId: String(orderRow.id),
        marker: String(orderRow.provider_marker),
        amount: (Number(orderRow.amount) / 100).toFixed(2),
        currency: String(orderRow.currency),
        customerEmail: buyerEmail,
        customerName: String(buyer.user_metadata?.name ?? buyer.email?.split("@")[0] ?? "Client Sellow"),
        productTitle: product.title,
        returnUrl: `${baseUrl}/api/saspay/return?order=${encodeURIComponent(String(orderRow.id))}`,
      });
      const checked = await checkSasPayCheckout(client, session, { refresh: Boolean(existingSessionId) });
      let cancellation = "not_requested";
      if (checked.outcome === "FEE_MODE_MISMATCH" && checked.sessionId && checked.providerStatus === "PENDING") {
        try {
          await client.cancelCheckoutSession(checked.sessionId);
          cancellation = "confirmed";
        } catch {
          cancellation = "request_failed";
        }
      }
      const { data: savedSession, error: saveSessionError } = await admin.from("orders").update({
        provider_session_id: checked.sessionId,
        provider_checkout_url: checked.storedCheckoutUrl,
        provider_status: checked.outcome === "CONFIRMED" ? checked.providerStatus : checked.outcome,
        fee_charge_mode: checked.feeMode,
        ...(cancellation === "confirmed" || ["EXPIRED", "CANCELLED"].includes(checked.providerStatus ?? "") ? { status: "canceled" } : {}),
      }).eq("id", orderRow.id).eq("status", "pending").select("id").maybeSingle();
      if (saveSessionError) throw new Error("Le lien de paiement n’a pas pu être enregistré.");
      if (!savedSession) {
        const { data: currentOrder } = await admin.from("orders").select("*")
          .eq("id", orderRow.id).eq("buyer_id", buyer.id).maybeSingle();
        if (currentOrder?.status === "paid") return NextResponse.json({ order: publicOrder(currentOrder) });
        throw new Error("La commande n’est plus en attente de paiement.");
      }
      console.info("saspay.checkout_check", {
        orderId: orderRow.id, outcome: checked.outcome, providerStatus: checked.providerStatus,
        cancellation, ...checked.diagnostic,
      });
      if (!checked.checkoutUrl) {
        return NextResponse.json({ error: CHECKOUT_UNAVAILABLE_MESSAGE }, { status: 503 });
      }
      return NextResponse.json({ order: publicOrder(orderRow), checkoutUrl: checked.checkoutUrl });
    } catch {
      // Keep an existing session for a verified retry rather than losing its reference.
      await admin.from("orders").update({ provider_status: "SESSION_REQUEST_FAILED" }).eq("id", orderRow.id).eq("status", "pending");
      console.warn("saspay.checkout_request_failed", { orderId: orderRow.id });
      return NextResponse.json({ error: CHECKOUT_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
  }

  const demoEnabled = process.env.NODE_ENV !== "production" && (process.env.DEMO_CHECKOUT_ENABLED === "true" || mode === "demo");
  if (!demoEnabled) return NextResponse.json({ error: "Le mode de paiement n’est pas configuré." }, { status: 503 });

  const { data: priorOrder } = await admin.from("orders").select("*").eq("idempotency_key", idempotencyKey).eq("buyer_id", buyer.id).maybeSingle();
  if (priorOrder) return NextResponse.json({ order: publicOrder(priorOrder) });
  const orderId = randomUUID();
  const orderRecord = {
    id: orderId,
    idempotency_key: idempotencyKey,
    access_token: `${randomUUID()}${randomUUID().replaceAll("-", "")}`,
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
    status: "paid_demo",
    provider: "demo",
  };
  const { error: orderError } = await admin.from("orders").insert(orderRecord);
  if (orderError) return NextResponse.json({ error: "Impossible d’enregistrer la commande de démonstration." }, { status: 500 });
  const { error: entitlementError } = await admin.from("entitlements").insert({ order_id: orderId, product_id: row.id, buyer_id: buyer.id, active: true });
  if (entitlementError) {
    await admin.from("orders").delete().eq("id", orderId);
    return NextResponse.json({ error: "Impossible d’ouvrir l’accès au produit." }, { status: 500 });
  }
  return NextResponse.json({ order: publicOrder({ ...orderRecord, created_at: new Date().toISOString() }) });
}
