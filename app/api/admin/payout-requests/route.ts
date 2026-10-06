import { NextResponse } from "next/server";
import { storedUnitsToAmount } from "@/lib/payment/accounting.mjs";
import { getSellowAdminContext } from "@/lib/supabase/admin-auth";

export async function GET() {
  const context = await getSellowAdminContext();
  if (!context) return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
  if (!context.admin) return NextResponse.json({ error: "Supabase côté serveur n’est pas configuré." }, { status: 503 });
  const { data, error } = await context.admin.from("payout_requests")
    .select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "La file de retraits n’a pas pu être chargée." }, { status: 500 });
  const creatorIds = [...new Set((data ?? []).map((row) => String(row.creator_id)))];
  const { data: creators } = creatorIds.length
    ? await context.admin.from("creators").select("id, name, slug").in("id", creatorIds)
    : { data: [] };
  const creatorsById = new Map((creators ?? []).map((creator) => [String(creator.id), creator]));
  const requests = (data ?? []).map((row) => ({
    id: String(row.id),
    creatorId: String(row.creator_id),
    creatorName: String(creatorsById.get(String(row.creator_id))?.name ?? "Créateur"),
    creatorSlug: String(creatorsById.get(String(row.creator_id))?.slug ?? ""),
    amount: storedUnitsToAmount(Number(row.amount)),
    currency: String(row.currency),
    countryCode: String(row.country_code),
    network: String(row.network),
    accountName: String(row.account_name),
    phoneNumber: String(row.phone_number),
    status: String(row.status),
    paymentReference: row.payment_reference ? String(row.payment_reference) : undefined,
    adminNote: row.admin_note ? String(row.admin_note) : undefined,
    createdAt: String(row.created_at),
  }));
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "private, no-store" } });
}
