const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateProductPricing(price, compareAtPrice, currency) {
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100))) throw new Error("Le prix doit être un montant valide et positif ou nul.");
  if (compareAtPrice !== undefined && (!Number.isFinite(compareAtPrice) || compareAtPrice <= price || !Number.isSafeInteger(Math.round(compareAtPrice * 100)))) throw new Error("Le prix barré doit être supérieur au prix de vente.");
  if (["XAF", "XOF"].includes(currency) && (!Number.isInteger(price) || (compareAtPrice !== undefined && !Number.isInteger(compareAtPrice)))) throw new Error("Les prix en FCFA doivent être des nombres entiers.");
}

export function normalizeProductFiles(value) {
  if (!Array.isArray(value)) throw new Error("La liste des fichiers est invalide.");
  const ids = new Set();
  return value.map((file, position) => {
    if (!file || !uuid.test(file.id ?? "") || ids.has(file.id)) throw new Error("Chaque fichier doit avoir un identifiant unique.");
    ids.add(file.id);
    const name = String(file.name ?? "").trim();
    const fileName = String(file.fileName ?? "").trim();
    if (!name || !fileName || name.length > 255 || fileName.length > 255 || /[\u0000-\u001f]/.test(name + fileName)) throw new Error("Donnez un nom valide à chaque fichier (255 caractères maximum).");
    if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0)) throw new Error("La taille du fichier est invalide.");
    return { id: file.id, name, fileName, size: file.size, mimeType: file.mimeType ? String(file.mimeType).slice(0, 255) : undefined, position };
  });
}

export function productFileStoragePath(creatorId, productId, file) {
  return `${creatorId}/${productId}/files/${file.id}/${file.fileName.replace(/[^\w.-]/g, "_")}`;
}

export function productFilesFromRows(rows) {
  return rows.map((row) => ({ id: row.id, name: row.name, fileName: row.file_name, size: row.size_bytes == null ? undefined : Number(row.size_bytes), mimeType: row.mime_type ?? undefined, position: row.position }));
}

export async function readAllProductFileRows(admin, productId, columns) {
  const rows = [];
  // Paginate the Data API rather than treating its row limit as a file-count limit.
  for (;;) {
    const { data, count, error } = await admin.from("product_files").select(columns, { count: "exact" }).eq("product_id", productId).order("position").order("id").range(rows.length, rows.length + 499);
    if (error) throw new Error("La liste des fichiers n’a pas pu être chargée.");
    if (!data?.length) break;
    rows.push(...data);
    if (count !== null && count !== undefined && rows.length >= count) break;
    if (count == null && data.length < 500) break;
  }
  return rows;
}

export function changeFavorite(current, productId, enabled) {
  if (current.includes(productId)) return current.filter((id) => id !== productId);
  return enabled === false ? current : [...current, productId];
}
