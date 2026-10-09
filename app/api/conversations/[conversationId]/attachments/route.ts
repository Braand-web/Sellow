import { randomUUID } from "node:crypto";
import { consumeRateLimit } from "@/lib/checkout-identity";
import { attachmentError } from "@/lib/messaging.mjs";
import {
  conversationAccess,
  messageBody,
  MessagingError,
  messagingFailure,
  messagingIdentity,
  messagingResponse,
  optionalId,
} from "@/lib/messaging-server";
type Context = { params: Promise<{ conversationId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const identity = await messagingIdentity(request);
    const { conversationId } = await context.params;
    await conversationAccess(identity, conversationId);
    const { data: blocked } = await identity.admin
      .from("conversation_participants")
      .select("blocked")
      .eq("conversation_id", conversationId)
      .eq("blocked", true);
    if (blocked?.length) throw new Error("messaging_blocked");
    const body = await messageBody(request);
    if (
      typeof body.name !== "string" ||
      typeof body.mimeType !== "string" ||
      typeof body.size !== "number"
    )
      throw new MessagingError("Le fichier est invalide.");
    const validation = attachmentError({
      name: body.name,
      mimeType: body.mimeType,
      size: body.size,
    });
    if (validation) throw new MessagingError(validation);
    if (
      !(await consumeRateLimit(
        identity.admin,
        request,
        "message-upload",
        60,
        60,
        identity.user.id,
      ))
    )
      throw new Error("messaging_rate");
    const id = randomUUID(),
      path = `${conversationId}/${identity.user.id}/${id}`;
    const { error } = await identity.admin
      .from("message_attachments")
      .insert({
        id,
        conversation_id: conversationId,
        uploader_id: identity.user.id,
        storage_path: path,
        name: body.name,
        mime_type: body.mimeType,
        size: body.size,
      });
    if (error) throw error;
    const { data, error: uploadError } = await identity.admin.storage
      .from("message-files")
      .createSignedUploadUrl(path, { upsert: false });
    if (uploadError || !data)
      throw uploadError ?? new Error("upload_unavailable");
    return messagingResponse({ id, path, token: data.token });
  } catch (error) {
    return messagingFailure(error);
  }
}
export async function GET(request: Request, context: Context) {
  try {
    const identity = await messagingIdentity(request);
    const { conversationId } = await context.params;
    await conversationAccess(identity, conversationId);
    const id = optionalId(new URL(request.url).searchParams.get("id"));
    if (!id) throw new MessagingError("Fichier introuvable.", 404);
    const { data: file, error } = await identity.admin
      .from("message_attachments")
      .select("storage_path,name,mime_type")
      .eq("id", id)
      .eq("conversation_id", conversationId)
      .not("message_id", "is", null)
      .maybeSingle();
    if (error) throw error;
    if (!file) throw new MessagingError("Fichier introuvable.", 404);
    const { data, error: signError } = await identity.admin.storage
      .from("message-files")
      .createSignedUrl(file.storage_path, 60, {
        download: file.mime_type === "application/pdf" ? file.name : undefined,
      });
    if (signError) throw signError;
    return messagingResponse({ url: data?.signedUrl });
  } catch (error) {
    return messagingFailure(error);
  }
}
