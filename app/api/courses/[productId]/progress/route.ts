import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canAccessProductContent } from "@/lib/supabase/content-access";
import type { CourseProgress } from "@/lib/types";

type RouteContext = { params: Promise<{ productId: string }> };

async function verify(requestId: string) {
  const auth = await getSupabaseServerClient();
  const { data: authData } = auth ? await auth.auth.getUser() : { data: { user: null } };
  if (!authData.user) return { response: NextResponse.json({ error: "Connectez-vous pour suivre ce cours." }, { status: 401 }) };
  const admin = getSupabaseAdmin();
  if (!admin) return { response: NextResponse.json({ error: "Supabase côté serveur n’est pas configuré." }, { status: 503 }) };
  const access = await canAccessProductContent(admin, requestId, authData.user.id);
  if (!access.allowed || access.product?.product_kind !== "course") return { response: NextResponse.json({ error: "Un achat ou un abonnement actif est nécessaire." }, { status: 403 }) };
  return { admin, userId: authData.user.id };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const checked = await verify(productId);
  if ("response" in checked) return checked.response;
  const { data } = await checked.admin.from("course_progress").select("completed_lesson_ids, last_lesson_id").eq("buyer_id", checked.userId).eq("course_id", productId).maybeSingle();
  const progress: CourseProgress = { completedLessonIds: data?.completed_lesson_ids ?? [], lastLessonId: data?.last_lesson_id ?? undefined };
  return NextResponse.json({ progress }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const checked = await verify(productId);
  if ("response" in checked) return checked.response;
  let body: { progress?: CourseProgress };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Progression invalide." }, { status: 400 }); }
  const { data: row } = await checked.admin.from("product_contents").select("content").eq("product_id", productId).maybeSingle();
  const validIds = new Set((row?.content?.modules ?? []).flatMap((module: { lessons?: { id: string }[] }) => (module.lessons ?? []).map((lesson) => lesson.id)));
  const submitted = body.progress ?? { completedLessonIds: [] };
  const completedLessonIds = [...new Set(submitted.completedLessonIds ?? [])].filter((id) => validIds.has(id));
  const lastLessonId = submitted.lastLessonId && validIds.has(submitted.lastLessonId) ? submitted.lastLessonId : null;
  const { error } = await checked.admin.from("course_progress").upsert({
    buyer_id: checked.userId,
    course_id: productId,
    completed_lesson_ids: completedLessonIds,
    last_lesson_id: lastLessonId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "buyer_id,course_id" });
  if (error) return NextResponse.json({ error: "La progression n’a pas pu être enregistrée." }, { status: 500 });
  return NextResponse.json({ progress: { completedLessonIds, lastLessonId } });
}
