import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessProductContent } from "@/lib/supabase/content-access";
import { normalizeProductFiles, productFileStoragePath, productFilesFromRows } from "@/lib/product-files.mjs";

type Context = { params: Promise<{ productId: string }> };
const privateHeaders = { "Cache-Control": "private, no-store" };

async function authorize(productId: string) {
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: { user: null } };
  if (!data.user) return { response: NextResponse.json({ error: "Connectez-vous pour accéder aux fichiers." }, { status: 401, headers: privateHeaders }) };
  const admin = getSupabaseAdmin();
  if (!admin) return { response: NextResponse.json({ error: "Le stockage est temporairement indisponible." }, { status: 503, headers: privateHeaders }) };
  const access = await canAccessProductContent(admin, productId, data.user.id);
  if (!access.allowed) return { response: NextResponse.json({ error: "Vous n’avez pas accès aux fichiers de ce produit." }, { status: 403, headers: privateHeaders }) };
  return { admin, access, user: data.user };
}

export async function GET(_request: Request, { params }: Context) {
  const { productId } = await params;
  const authorization = await authorize(productId);
  if (authorization.response) return authorization.response;
  const { data, error } = await authorization.admin.from("product_files").select("id, name, file_name, size_bytes, mime_type, position").eq("product_id", productId).order("position");
  if (error) return NextResponse.json({ error: "La liste des fichiers n’a pas pu être chargée." }, { status: 503, headers: privateHeaders });
  return NextResponse.json({ files: productFilesFromRows(data ?? []) }, { headers: privateHeaders });
}

export async function PUT(request: Request, { params }: Context) {
  const { productId } = await params;
  const authorization = await authorize(productId);
  if (authorization.response) return authorization.response;
  const { admin, access, user } = authorization;
  if (!access.owner || access.product?.product_kind !== "download") return NextResponse.json({ error: "Seul le créateur peut modifier ces fichiers." }, { status: 403, headers: privateHeaders });
  try {
    const { files: input } = await request.json();
    const files = normalizeProductFiles(input);
    const { data: existing, error: lookupError } = await admin.from("product_files").select("id, storage_path, file_name").eq("product_id", productId);
    if (lookupError) throw new Error("La liste actuelle des fichiers est indisponible.");
    const rows = files.map((file) => {
      const previous = existing?.find((row) => row.id === file.id);
      if (previous && previous.file_name !== file.fileName) throw new Error("Le nom du fichier source ne peut pas être modifié. Modifiez son nom d’affichage.");
      return { id: file.id, name: file.name, file_name: file.fileName, storage_path: previous?.storage_path ?? productFileStoragePath(user.id, productId, file), size_bytes: file.size ?? null, mime_type: file.mimeType ?? null, position: file.position };
    });
    const { error } = await admin.rpc("replace_product_files", { p_product_id: productId, p_creator_id: user.id, p_files: rows });
    if (error) throw new Error("Les fichiers n’ont pas pu être enregistrés. Vérifiez les téléversements et réessayez.");
    // Keep removed blobs private: deleting them could invalidate an in-flight signed download.
    return NextResponse.json({ files }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "La liste des fichiers est invalide." }, { status: 400, headers: privateHeaders });
  }
}
