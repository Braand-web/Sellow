import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveProductFileDownload } from "@/lib/product-file-access.mjs";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  if (!authData.user) return NextResponse.json({ error: "Connectez-vous pour télécharger ce fichier." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Les téléchargements sont temporairement indisponibles. Réessayez plus tard." }, { status: 503 });

  const { orderId } = await params;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await resolveProductFileDownload(supabase, { orderId, userId: authData.user.id, fileId: new URL(request.url).searchParams.get("fileId") });
  if (result.path === undefined) return NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });

  const { data: file, error } = await supabase.storage
    .from("product-files")
    .createSignedUrl(result.path, 90, { download: result.fileName || true });
  if (error || !file?.signedUrl) return NextResponse.json({ error: "Le lien de téléchargement n’a pas pu être créé." }, { status: 500 });

  return NextResponse.redirect(file.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
