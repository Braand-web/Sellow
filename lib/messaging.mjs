export const MESSAGE_LIMIT = 4000;
export const ATTACHMENT_LIMIT = 3;
export const FILE_LIMIT = 10 * 1024 * 1024;
export const MESSAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function attachmentError(file) {
  if (
    !file ||
    typeof file.name !== "string" ||
    !file.name.trim() ||
    file.name.length > 180 ||
    /[\u0000-\u001f/\\]/.test(file.name)
  )
    return "Le nom du fichier est invalide.";
  if (!MESSAGE_MIME_TYPES.includes(file.mimeType ?? file.type))
    return "Choisissez une image JPG, PNG, WebP ou un PDF.";
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > FILE_LIMIT
  )
    return "Chaque fichier doit peser au maximum 10 Mo.";
  return null;
}
export function messageError(body, attachments) {
  if (typeof body !== "string" || body.length > MESSAGE_LIMIT)
    return "Votre message peut contenir au maximum 4 000 caractères.";
  if (
    !Array.isArray(attachments) ||
    attachments.length > ATTACHMENT_LIMIT ||
    new Set(attachments).size !== attachments.length
  )
    return "Vous pouvez joindre trois fichiers maximum.";
  if (!body.trim() && !attachments.length)
    return "Écrivez un message ou ajoutez un fichier.";
  return null;
}
export function fileMatches(bytes, mimeType) {
  if (!(bytes instanceof Uint8Array)) return false;
  const starts = (value) => value.every((byte, i) => bytes[i] === byte);
  const text = (start, length) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if (mimeType === "image/png")
    return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (mimeType === "image/jpeg") return starts([255, 216, 255]);
  if (mimeType === "image/webp")
    return text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
  return mimeType === "application/pdf" && text(0, 5) === "%PDF-";
}
// Input is already scoped to one verified buyer and one seller by the caller.
export function customerSummary(orders) {
  const purchases = orders.flatMap((o) => {
    const kind =
      o.status === "refunded"
        ? "refunded"
        : ["paid_demo", "canceled_demo"].includes(o.status)
          ? "demo"
          : o.status === "paid"
            ? Number(o.amount) === 0
              ? "free"
              : "paid"
            : null;
    if (!kind) return [];
    return [
      {
        id: o.id,
        productId: o.product_id ?? o.productId,
        title: o.product_title ?? o.productTitle,
        slug: o.product_slug ?? o.productSlug,
        amount: Number(o.amount),
        currency: o.currency,
        createdAt: o.paid_at ?? o.created_at ?? o.createdAt,
        status: o.status,
        kind,
      },
    ];
  });
  return {
    paidCount: purchases.filter((p) => p.kind === "paid").length,
    freeCount: purchases.filter((p) => p.kind === "free").length,
    refundCount: purchases.filter((p) => p.kind === "refunded").length,
    demoCount: purchases.filter((p) => p.kind === "demo").length,
    purchases,
  };
}
export function customerBadge(summary) {
  return summary.paidCount
    ? `Client · ${summary.paidCount} achat${summary.paidCount > 1 ? "s" : ""} confirmé${summary.paidCount > 1 ? "s" : ""}`
    : "Prospect";
}
export function messageNotification(
  conversationId,
  appUrl = "https://sellow.fun",
) {
  if (!UUID.test(conversationId)) throw new Error("invalid_conversation");
  const url = new URL(`/messages/${conversationId}`, appUrl).toString();
  return {
    subject: "Vous avez des messages non lus sur Sellow",
    text: `Un échange vous attend sur Sellow.\n\nOuvrir la discussion : ${url}\n\nVous pouvez désactiver ces alertes dans les préférences de la discussion.`,
  };
}
