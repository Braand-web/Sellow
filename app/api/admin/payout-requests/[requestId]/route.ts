import { NextResponse } from "next/server";
import { getSellowAdminContext } from "@/lib/supabase/admin-auth";

export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  const adminContext = await getSellowAdminContext();
  if (!adminContext) return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
  if (!adminContext.admin) return NextResponse.json({ error: "Ce service est temporairement indisponible. Réessayez plus tard." }, { status: 503 });
  const { requestId } = await context.params;
  let body: { status?: unknown; paymentReference?: unknown; note?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "La demande est invalide." }, { status: 400 }); }
  const status = String(body.status ?? "");
  const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!["approved", "rejected", "paid"].includes(status) || (status === "paid" && paymentReference.length < 2)) {
    return NextResponse.json({ error: "Choisissez une action valide et ajoutez la référence du versement si le paiement est effectué." }, { status: 400 });
  }
  const { data, error } = await adminContext.admin.rpc("update_payout_request", {
    p_request_id: requestId,
    p_next_status: status,
    p_payment_reference: paymentReference || null,
    p_admin_note: note || null,
  });
  if (error) return NextResponse.json({ error: error.message.includes("invalid payout status") ? "Cette demande a déjà changé d’état." : "La demande n’a pas pu être mise à jour." }, { status: 409 });
  return NextResponse.json({ request: { id: String(data.id), status: String(data.status), paymentReference: data.payment_reference ? String(data.payment_reference) : undefined } });
}
