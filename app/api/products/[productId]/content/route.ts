import { NextResponse } from "next/server";
import { contentFromLegacy, emptyProductContent, normalizeProductContent, videoEmbed } from "@/lib/product-content";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canAccessProductContent } from "@/lib/supabase/content-access";
import type { Product } from "@/lib/types";
import { collectRichTextImages, collectRichTextVideoUrls, stripRichTextStoragePaths } from "@/lib/rich-text";

type RouteContext = { params: Promise<{ productId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Ce service est temporairement indisponible. Réessayez plus tard." }, { status: 503 });
  const auth = await getSupabaseServerClient();
  const { data: authData } = auth ? await auth.auth.getUser() : { data: { user: null } };
  const { data: product } = await admin.from("products").select("id, creator_id, product_kind, published, details").eq("id", productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  const { data: row } = await admin.from("product_contents").select("content").eq("product_id", productId).maybeSingle();
  const raw = row?.content ?? legacyContent(product.details, productId);
  const normalized = normalizeProductContent(raw);
  let allowed = false;
  if (authData.user) {
    const access = await canAccessProductContent(admin, productId, authData.user.id);
    allowed = access.allowed;
  }
  if (allowed) {
    const { data: courses } = await admin.from("membership_courses").select("course_id").eq("membership_id", productId);
    normalized.membershipCourseIds = (courses ?? []).map((course) => String(course.course_id));
    return NextResponse.json({ content: normalized }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (product.product_kind === "membership" && product.published) {
    const { data: courses } = await admin.from("membership_courses").select("course_id").eq("membership_id", productId);
    return NextResponse.json({ content: { ...emptyProductContent(), membershipCourseIds: (courses ?? []).map((course) => String(course.course_id)) }, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (product.product_kind === "course" && product.published) {
    const preview = {
      ...emptyProductContent(),
      modules: normalized.modules.map((module) => ({
        ...module,
        lessons: module.lessons.filter((lesson) => lesson.isPreview).map((lesson) => ({
          ...lesson,
          descriptionContent: stripRichTextStoragePaths(lesson.descriptionContent),
          resources: (lesson.resources ?? []).map(({ id, name, fileName }) => ({ id, name, fileName })),
        })),
      })).filter((module) => module.lessons.length),
    };
    return NextResponse.json({ content: preview, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ error: "Cet achat ou abonnement est nécessaire pour accéder au contenu." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const auth = await getSupabaseServerClient();
  const { data: authData } = auth ? await auth.auth.getUser() : { data: { user: null } };
  if (!authData.user) return NextResponse.json({ error: "Connectez-vous pour modifier ce contenu." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Ce service est temporairement indisponible. Réessayez plus tard." }, { status: 503 });
  const { data: product } = await admin.from("products").select("id, creator_id, product_kind").eq("id", productId).maybeSingle();
  if (!product || product.creator_id !== authData.user.id) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  let body: { content?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Contenu invalide." }, { status: 400 }); }
  const content = normalizeProductContent(body.content);
  const videoUrls = [
    ...content.modules.flatMap((module) => module.lessons.flatMap((lesson) => [lesson.videoUrl, ...collectRichTextVideoUrls(lesson.descriptionContent)])),
    ...content.membershipPosts.flatMap((post) => [post.videoUrl, ...collectRichTextVideoUrls(post.bodyContent)]),
  ].filter((url): url is string => Boolean(url));
  if (videoUrls.some((url) => !videoEmbed(url))) return NextResponse.json({ error: "Utilisez un lien vidéo YouTube ou Vimeo valide." }, { status: 400 });
  const resources = [
    ...content.modules.flatMap((module) => module.lessons.flatMap((lesson) => lesson.resources ?? [])),
    ...content.membershipPosts.flatMap((post) => post.resources ?? []),
  ];
  if (resources.some((resource) => resource.storagePath && !resource.storagePath.startsWith(`${authData.user.id}/${productId}/resources/`))) {
    return NextResponse.json({ error: "Un fichier doit provenir de l’espace privé de ce produit." }, { status: 400 });
  }
  const imagePaths = [
    ...content.modules.flatMap((module) => module.lessons.flatMap((lesson) => collectRichTextImages(lesson.descriptionContent).map((image) => image.storagePath))),
    ...content.membershipPosts.flatMap((post) => collectRichTextImages(post.bodyContent).map((image) => image.storagePath)),
  ].filter((path): path is string => Boolean(path));
  if (imagePaths.some((path) => !path.startsWith(`${authData.user.id}/${productId}/resources/`))) {
    return NextResponse.json({ error: "Une image doit provenir de l’espace privé de ce produit." }, { status: 400 });
  }
  const courseIds = product.product_kind === "membership" ? [...new Set(content.membershipCourseIds)] : [];
  const previous = await admin.from("membership_courses").select("course_id").eq("membership_id", productId);
  const previousIds = new Set((previous.data ?? []).map((course) => String(course.course_id)));
  if (courseIds.length) {
    const { data: eligible, error } = await admin.from("products").select("id, published").in("id", courseIds).eq("creator_id", authData.user.id).eq("product_kind", "course");
    if (error || eligible?.length !== courseIds.length) return NextResponse.json({ error: "Choisissez uniquement vos cours publiés." }, { status: 400 });
    if (eligible.some((course) => !course.published && !previousIds.has(String(course.id)))) return NextResponse.json({ error: "Un nouveau cours doit être publié avant de l’inclure." }, { status: 400 });
  }
  if (product.product_kind === "membership") {
    const removedIds = [...previousIds].filter((id) => !courseIds.includes(id));
    const addedIds = courseIds.filter((id) => !previousIds.has(id));
    if (removedIds.length) {
      const removed = await admin.from("membership_courses").delete().eq("membership_id", productId).in("course_id", removedIds);
      if (removed.error) return NextResponse.json({ error: "Les cours inclus n’ont pas pu être mis à jour." }, { status: 500 });
    }
    if (addedIds.length) {
      const inserted = await admin.from("membership_courses").insert(addedIds.map((courseId) => ({ membership_id: productId, course_id: courseId })));
      if (inserted.error) {
        if (removedIds.length) await admin.from("membership_courses").insert(removedIds.map((courseId) => ({ membership_id: productId, course_id: courseId })));
        return NextResponse.json({ error: "Les cours inclus n’ont pas pu être enregistrés." }, { status: 500 });
      }
    }
    content.membershipCourseIds = courseIds;
  }
  const { error } = await admin.from("product_contents").upsert({ product_id: productId, content, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
  if (error) return NextResponse.json({ error: "Le contenu n’a pas pu être enregistré." }, { status: 500 });
  if (product.product_kind === "course") {
    const lessonCount = content.modules.reduce((count, module) => count + module.lessons.length, 0);
    const { data: currentProduct } = await admin.from("products").select("details").eq("id", productId).maybeSingle();
    const { error: summaryError } = await admin.from("products").update({
      details: { ...(currentProduct?.details ?? {}), lessons: lessonCount },
    }).eq("id", productId).eq("creator_id", authData.user.id);
    if (summaryError) return NextResponse.json({ error: "Le contenu est enregistré, mais le nombre de leçons n’a pas pu être actualisé." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const auth = await getSupabaseServerClient();
  const { data: authData } = auth ? await auth.auth.getUser() : { data: { user: null } };
  if (!authData.user) return NextResponse.json({ error: "Connectez-vous pour migrer ce contenu." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Ce service est temporairement indisponible. Réessayez plus tard." }, { status: 503 });
  const { data: product } = await admin.from("products").select("id, creator_id, details").eq("id", productId).maybeSingle();
  if (!product || product.creator_id !== authData.user.id) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  const { data: current } = await admin.from("product_contents").select("product_id").eq("product_id", productId).maybeSingle();
  if (current || (!product.details?.courseLessons?.length && !product.details?.membershipPosts?.length)) return NextResponse.json({ ok: true });
  const content = contentFromLegacy({ id: productId, details: product.details } as Product);
  const { error: saveError } = await admin.from("product_contents").insert({ product_id: productId, content });
  if (saveError) return NextResponse.json({ error: "La migration du contenu a échoué." }, { status: 500 });
  const publicDetails = { ...product.details };
  delete publicDetails.courseLessons;
  delete publicDetails.membershipPosts;
  const { error: scrubError } = await admin.from("products").update({ details: publicDetails }).eq("id", productId);
  if (scrubError) return NextResponse.json({ error: "Le contenu a été migré, mais les anciennes données publiques restent à nettoyer." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function legacyContent(details: Record<string, unknown> | null, id: string) {
  return contentFromLegacy({ id, details: (details ?? {}) as Product["details"] } as Product);
}
