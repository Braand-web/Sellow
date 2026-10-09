import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/checkout-identity";
import { customerSummary, UUID } from "@/lib/messaging.mjs";
import type { Conversation, Message } from "@/lib/types";

export class MessagingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function messagingResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function messagingIdentity(request: Request) {
  if (process.env.MESSAGING_ENABLED !== "true")
    throw new MessagingError("La messagerie n’est pas encore disponible.", 503);
  if (request.method !== "GET" && !sameOrigin(request))
    throw new MessagingError("Cette demande n’est pas autorisée.", 403);
  const auth = await getSupabaseServerClient();
  const { data } = auth ? await auth.auth.getUser() : { data: { user: null } };
  if (!data.user?.email_confirmed_at)
    throw new MessagingError(
      "Connectez-vous avec une adresse e-mail vérifiée pour accéder aux messages.",
      401,
    );
  const admin = getSupabaseAdmin();
  if (!admin)
    throw new MessagingError(
      "La messagerie est temporairement indisponible.",
      503,
    );
  return { admin, user: data.user };
}
export function messagingFailure(error: unknown) {
  if (error instanceof MessagingError)
    return messagingResponse({ error: error.message }, error.status);
  const code = String((error as { message?: string })?.message ?? "");
  if (code.includes("messaging_rate"))
    return messagingResponse(
      {
        error:
          "Vous avez envoyé plusieurs demandes. Patientez avant de réessayer.",
      },
      429,
    );
  if (code.includes("messaging_blocked"))
    return messagingResponse(
      { error: "Les nouveaux messages sont bloqués dans cette discussion." },
      409,
    );
  if (/messaging_(access|source)/.test(code))
    return messagingResponse(
      { error: "Cette discussion ou cette référence n’est pas accessible." },
      404,
    );
  if (/messaging_(invalid|attachment|identity)/.test(code))
    return messagingResponse(
      { error: "Vérifiez votre message et les fichiers joints." },
      400,
    );
  console.warn("messaging.request_failed", { message: code.slice(0, 240) });
  return messagingResponse(
    {
      error:
        "Les messages sont temporairement indisponibles. Réessayez plus tard.",
    },
    503,
  );
}
export function conversationFromRow(
  row: Record<string, unknown>,
): Conversation {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    sellerId: String(row.seller_id),
    customerName: String(row.customer_name),
    sellerName: String(row.seller_name),
    sellerSlug: String(row.seller_slug),
    createdAt: String(row.created_at),
    lastMessageAt: String(row.last_message_at),
    unread: Number(row.unread ?? 0),
    lastMessage: (row.last_message as { body?: string })?.body,
  };
}
export function messageFromRow(
  row: Record<string, unknown>,
  attachments: Record<string, unknown>[] = [],
): Message {
  return {
    id: String(row.id),
    seq: Number(row.seq),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: String(row.created_at),
    clientRequestId: String(row.client_request_id),
    productId: row.context_product_id
      ? String(row.context_product_id)
      : undefined,
    orderId: row.context_order_id ? String(row.context_order_id) : undefined,
    contextTitle: row.context_title ? String(row.context_title) : undefined,
    contextSlug: row.context_slug ? String(row.context_slug) : undefined,
    attachments: attachments.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      size: Number(a.size),
      mimeType: String(a.mime_type),
    })),
  };
}
export async function conversationAccess(
  identity: Awaited<ReturnType<typeof messagingIdentity>>,
  id: string,
) {
  if (!UUID.test(id)) throw new MessagingError("Discussion introuvable.", 404);
  const { data, error } = await identity.admin
    .from("conversations")
    .select("*")
    .eq("id", id)
    .or(`customer_id.eq.${identity.user.id},seller_id.eq.${identity.user.id}`)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new MessagingError("Discussion introuvable.", 404);
  return data;
}
export async function summaryFor(
  identity: Awaited<ReturnType<typeof messagingIdentity>>,
  customerId: string,
  sellerId: string,
) {
  const purchases = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await identity.admin
      .from("orders")
      .select(
        "id,product_id,product_title,product_slug,amount,currency,status,created_at,paid_at",
      )
      .eq("buyer_id", customerId)
      .eq("creator_id", sellerId)
      .in("status", ["paid", "refunded", "paid_demo", "canceled_demo"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    purchases.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return customerSummary(
    [...new Map(purchases.map((o) => [o.id, o])).values()].map((o) => ({ ...o, amount: Number(o.amount) / 100 })),
  );
}
export function optionalId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !UUID.test(value))
    throw new MessagingError("La référence est invalide.");
  return value;
}
export async function messageBody(request: Request) {
  // JSON endpoints never accept file bytes; signed uploads bypass the web host.
  if (Number(request.headers.get("content-length") ?? 0) > 24000)
    throw new MessagingError("La demande est trop volumineuse.", 413);
  const text = await request.text();
  if (text.length > 24000)
    throw new MessagingError("La demande est trop volumineuse.", 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new MessagingError("La demande est invalide.");
  }
}
