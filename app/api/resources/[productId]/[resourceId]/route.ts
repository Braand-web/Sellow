import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canAccessProductContent } from "@/lib/supabase/content-access";

type RouteContext = { params: Promise<{ productId: string; resourceId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { productId, resourceId } = await params;
  const auth = await getSupabaseServerClient();
  const { data: authData } = auth ? await auth.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase côté serveur n’est pas configuré." }, { status: 503 });
  const { data: product } = await admin.from("products").select("product_kind, published").eq("id", productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  const { data } = await admin.from("product_contents").select("content").eq("product_id", productId).maybeSingle();
  const content = data?.content;
  const courseResources = (content?.modules ?? []).flatMap((module: { lessons?: { isPreview?: boolean; resources?: { id: string; fileName?: string; storagePath?: string }[] }[] }) => (module.lessons ?? []).flatMap((lesson) => (lesson.resources ?? []).map((resource) => ({ ...resource, preview: Boolean(lesson.isPreview) }))));
  const postResources = (content?.membershipPosts ?? []).flatMap((post: { resources?: { id: string; storagePath?: string }[] }) => post.resources ?? []);
  const resource = [...courseResources, ...postResources].find((item) => item.id === resourceId && item.storagePath);
  if (!resource?.storagePath) return NextResponse.json({ error: "La ressource est introuvable." }, { status: 404 });
  const publicPreview = product.product_kind === "course" && product.published && "preview" in resource && resource.preview;
  if (authData.user) {
    const access = await canAccessProductContent(admin, productId, authData.user.id);
    if (!access.allowed && !publicPreview) return NextResponse.json({ error: "Cette ressource est réservée aux acheteurs." }, { status: 403 });
  } else if (!publicPreview) {
    return NextResponse.json({ error: "Connectez-vous pour télécharger cette ressource." }, { status: 401 });
  }
  const { data: signed, error } = await admin.storage.from("product-files").createSignedUrl(resource.storagePath, 60, { download: resource.fileName ?? true });
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "Le téléchargement est indisponible." }, { status: 503 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
