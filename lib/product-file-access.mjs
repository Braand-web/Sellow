export async function resolveProductFileDownload(admin, { orderId, userId, fileId, now = new Date() }) {
  if (!userId) return { status: 401, error: "Connectez-vous pour télécharger ce fichier." };
  const { data: order } = await admin.from("orders").select("id, product_id, status, buyer_id").eq("id", orderId).in("status", ["paid_demo", "paid"]).maybeSingle();
  if (!order || order.buyer_id !== userId || !["paid", "paid_demo"].includes(order.status)) return { status: 404, error: "Cette commande ne donne pas accès au fichier." };
  const { data: entitlement } = await admin.from("entitlements").select("id, ends_at").eq("order_id", order.id).eq("product_id", order.product_id).eq("buyer_id", userId).eq("active", true).maybeSingle();
  if (!entitlement || (entitlement.ends_at && new Date(entitlement.ends_at) <= now)) return { status: 403, error: "L’accès à ce produit n’est plus actif." };
  if (fileId) {
    const { data: file } = await admin.from("product_files").select("storage_path, file_name").eq("product_id", order.product_id).eq("id", fileId).maybeSingle();
    if (!file?.storage_path) return { status: 404, error: "Ce fichier ne fait pas partie de votre achat." };
    return { path: file.storage_path, fileName: file.file_name };
  }
  const { data: product } = await admin.from("products").select("file_path, file_name").eq("id", order.product_id).maybeSingle();
  if (!product?.file_path) return { status: 404, error: "Aucun fichier n’est associé à ce produit." };
  return { path: product.file_path, fileName: product.file_name };
}
