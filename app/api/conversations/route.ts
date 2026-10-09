import {
  conversationFromRow,
  messageBody,
  messagingFailure,
  messagingIdentity,
  messagingResponse,
  optionalId,
} from "@/lib/messaging-server";
import { customerSummary } from "@/lib/messaging.mjs";

export async function GET(request: Request) {
  try {
    const identity = await messagingIdentity(request);
    const { data, error } = await identity.admin.rpc(
      "list_sellow_conversations",
      { p_user: identity.user.id },
    );
    if (error) throw error;
    const conversations = (data ?? []).map((row: Record<string, unknown>) => ({
      ...conversationFromRow(row),
      summary: customerSummary((row.orders as Record<string, unknown>[]) ?? []),
    }));
    return messagingResponse({
      conversations,
      unread: conversations.reduce(
        (n: number, c: { unread: number }) => n + c.unread,
        0,
      ),
    });
  } catch (error) {
    return messagingFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const identity = await messagingIdentity(request);
    const body = await messageBody(request);
    const productId = optionalId(body.productId),
      orderId = optionalId(body.orderId);
    let sellerId = optionalId(body.sellerId);
    if (orderId) {
      const { data } = await identity.admin
        .from("orders")
        .select("creator_id")
        .eq("id", orderId)
        .eq("buyer_id", identity.user.id)
        .maybeSingle();
      sellerId = data?.creator_id ?? null;
    } else if (productId) {
      const { data } = await identity.admin
        .from("products")
        .select("creator_id")
        .eq("id", productId)
        .eq("published", true)
        .maybeSingle();
      sellerId = data?.creator_id ?? null;
    }
    if (!sellerId) throw new Error("messaging_source");
    const { data, error } = await identity.admin.rpc(
      "open_sellow_conversation",
      {
        p_customer: identity.user.id,
        p_seller: sellerId,
        p_name: String(identity.user.user_metadata?.name ?? "Client"),
        p_product: productId,
        p_order: orderId,
      },
    );
    if (error) throw error;
    return messagingResponse({ conversation: conversationFromRow(data) });
  } catch (error) {
    return messagingFailure(error);
  }
}
