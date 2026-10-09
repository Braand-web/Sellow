import {
  conversationAccess,
  conversationFromRow,
  messageBody,
  messageFromRow,
  MessagingError,
  messagingFailure,
  messagingIdentity,
  messagingResponse,
  optionalId,
  summaryFor,
} from "@/lib/messaging-server";
import { fileMatches, messageError, UUID } from "@/lib/messaging.mjs";

type Context = { params: Promise<{ conversationId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const identity = await messagingIdentity(request);
    const { conversationId } = await context.params;
    const c = await conversationAccess(identity, conversationId);
    const before = new URL(request.url).searchParams.get("before");
    if (
      before &&
      (!/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)))
    )
      throw new MessagingError("La page demandée est invalide.");
    let query = identity.admin
      .from("messages")
      .select("*")
      .eq("conversation_id", c.id)
      .order("seq", { ascending: false })
      .limit(51);
    if (before) query = query.lt("seq", Number(before));
    const [
      { data: rows, error },
      { data: participants, error: participantError },
      summary,
    ] = await Promise.all([
      query,
      identity.admin
        .from("conversation_participants")
        .select("user_id,blocked,email_notifications")
        .eq("conversation_id", c.id),
      summaryFor(identity, c.customer_id, c.seller_id),
    ]);
    if (error || participantError) throw error ?? participantError;
    const visible = (rows ?? []).slice(0, 50).reverse();
    const { data: attachments, error: attachmentError } = visible.length
      ? await identity.admin
          .from("message_attachments")
          .select("id,message_id,name,size,mime_type")
          .in(
            "message_id",
            visible.map((m) => m.id),
          )
      : { data: [], error: null };
    if (attachmentError) throw attachmentError;
    const me = participants?.find((p) => p.user_id === identity.user.id);
    return messagingResponse({
      conversation: conversationFromRow(c),
      messages: visible.map((m) =>
        messageFromRow(
          m,
          (attachments ?? []).filter((a) => a.message_id === m.id),
        ),
      ),
      hasMore: (rows?.length ?? 0) > 50,
      summary,
      blocked: participants?.some((p) => p.blocked),
      blockedByMe: me?.blocked ?? false,
      emailNotifications: me?.email_notifications ?? true,
    });
  } catch (error) {
    return messagingFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const identity = await messagingIdentity(request);
    const { conversationId } = await context.params;
    await conversationAccess(identity, conversationId);
    const body = await messageBody(request);
    const attachments = body.attachments ?? [];
    if (
      typeof body.body !== "string" ||
      !Array.isArray(attachments) ||
      attachments.some((id) => typeof id !== "string" || !UUID.test(id))
    )
      throw new MessagingError("Le message est invalide.");
    const validation = messageError(body.body, attachments);
    if (validation) throw new MessagingError(validation);
    const requestId = optionalId(body.clientRequestId);
    if (!requestId) throw new MessagingError("Le message est invalide.");
    // Retries reuse the same nonce. Previously committed attachments must not be
    // downloaded or attached a second time.
    const { data: prior } = await identity.admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("sender_id", identity.user.id)
      .eq("client_request_id", requestId)
      .maybeSingle();
    if (!prior && attachments.length) {
      const { data: files, error } = await identity.admin
        .from("message_attachments")
        .select("*")
        .in("id", attachments)
        .eq("conversation_id", conversationId)
        .eq("uploader_id", identity.user.id)
        .is("message_id", null)
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      if (files?.length !== attachments.length)
        throw new MessagingError(
          "Un fichier est expiré ou inaccessible. Ajoutez-le à nouveau.",
        );
      for (const file of files) {
        const { data: blob, error: downloadError } =
          await identity.admin.storage
            .from("message-files")
            .download(file.storage_path);
        if (
          downloadError ||
          !blob ||
          blob.size !== Number(file.size) ||
          !fileMatches(new Uint8Array(await blob.arrayBuffer()), file.mime_type)
        )
          throw new MessagingError(
            "Un fichier ne correspond pas au format annoncé. Choisissez une image ou un PDF valide.",
          );
      }
      const { error: verificationError } = await identity.admin
        .from("message_attachments")
        .update({ verified: true })
        .in("id", attachments)
        .eq("uploader_id", identity.user.id)
        .is("message_id", null);
      if (verificationError) throw verificationError;
    }
    const { data, error } = await identity.admin.rpc("send_sellow_message", {
      p_conversation: conversationId,
      p_sender: identity.user.id,
      p_request: requestId,
      p_body: body.body,
      p_attachments: attachments,
      p_product: optionalId(body.productId),
      p_order: optionalId(body.orderId),
    });
    if (error) throw error;
    return messagingResponse({ id: data.id });
  } catch (error) {
    return messagingFailure(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const identity = await messagingIdentity(request);
    const { conversationId } = await context.params;
    await conversationAccess(identity, conversationId);
    const body = await messageBody(request);
    if (
      (body.readSeq !== undefined &&
        (!Number.isSafeInteger(body.readSeq) || Number(body.readSeq) < 0)) ||
      (body.blocked !== undefined && typeof body.blocked !== "boolean") ||
      (body.emailNotifications !== undefined &&
        typeof body.emailNotifications !== "boolean") ||
      (body.readIds !== undefined &&
        (!Array.isArray(body.readIds) ||
          body.readIds.length > 50 ||
          body.readIds.some((id) => typeof id !== "string" || !UUID.test(id))))
    )
      throw new MessagingError("Les préférences sont invalides.");
    const { error } = await identity.admin.rpc("update_sellow_participant", {
      p_conversation: conversationId,
      p_user: identity.user.id,
      p_read_seq: body.readSeq ?? null,
      p_blocked: body.blocked ?? null,
      p_email: body.emailNotifications ?? null,
      p_read_ids: body.readIds ?? [],
    });
    if (error) throw error;
    return messagingResponse({ saved: true });
  } catch (error) {
    return messagingFailure(error);
  }
}
