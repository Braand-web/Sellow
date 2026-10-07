import { NextResponse } from "next/server";
import { getSellowAdminContext } from "@/lib/supabase/admin-auth";
import { sameOrigin } from "@/lib/checkout-identity";
import { normalizeBuyerEmail } from "@/lib/guest-access.mjs";

export async function GET() {
  const context = await getSellowAdminContext();
  if (!context) return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
  if (!context.admin) return NextResponse.json({ error: "Ce service est temporairement indisponible." }, { status: 503 });
  const { data, error } = await context.admin.from("email_outbox").select("id, order_id, recipient, status, attempts, last_error, created_at, sent_at, orders(product_title, purchase_identity, guest_claimed_at, buyer_id, status)").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Les reçus n’ont pas pu être chargés." }, { status: 503 });
  return NextResponse.json({ emails: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  const context = await getSellowAdminContext();
  if (!context) return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
  if (!context.admin) return NextResponse.json({ error: "Ce service est temporairement indisponible." }, { status: 503 });
  const body = await request.json().catch(() => null) as { action?: string; id?: string; email?: string; reference?: string } | null;
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Sélectionnez une commande ou un reçu valide." }, { status: 400 });
  if (body.action === "retry") {
    const { data, error } = await context.admin.from("email_outbox").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), locked_until: null, last_error: null }).eq("id", body.id).eq("status", "failed").select("id").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Ce reçu ne peut pas être relancé." }, { status: 409 });
    return NextResponse.json({ message: "Le reçu sera envoyé lors de la prochaine reprise." });
  }
  if (body.action === "correct") {
    const email = normalizeBuyerEmail(body.email);
    if (!email || !body.reference?.trim()) return NextResponse.json({ error: "Vérifiez l’adresse et la référence de la transaction contrôlée." }, { status: 400 });
    const { data, error } = await context.admin.rpc("correct_guest_order_email", { p_order_id: body.id, p_email: email, p_transaction_reference: body.reference.trim(), p_admin_id: context.user.id });
    if (error || data !== true) return NextResponse.json({ error: "Correction refusée : vérifiez la transaction. Une commande déjà rattachée ou un envoi en cours ne peut pas être modifié." }, { status: 409 });
    return NextResponse.json({ message: "L’adresse a été corrigée. Un nouveau reçu sera envoyé." });
  }
  return NextResponse.json({ error: "Cette action n’est pas disponible." }, { status: 400 });
}
