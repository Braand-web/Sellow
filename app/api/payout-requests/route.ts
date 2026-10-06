import { NextResponse } from "next/server";
import { amountToStoredUnits, currencyFractionDigits, storedUnitsToAmount } from "@/lib/payment/accounting.mjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function safeRequest(row: Record<string, unknown>) {
  return {
    id: String(row.id),
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
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
  };
}

export async function GET() {
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!authData.user || !admin) return NextResponse.json({ error: "Connectez-vous à votre compte créateur." }, { status: 401 });
  const { data, error } = await admin.from("payout_requests").select("*").eq("creator_id", authData.user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Les demandes de retrait n’ont pas pu être chargées." }, { status: 500 });
  return NextResponse.json({ requests: (data ?? []).map((row) => safeRequest(row as Record<string, unknown>)) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine de la demande non autorisée." }, { status: 403 });
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!authData.user || !admin) return NextResponse.json({ error: "Connectez-vous à votre compte créateur." }, { status: 401 });

  let body: { amount?: unknown; currency?: unknown; countryCode?: unknown; network?: unknown; accountName?: unknown; phoneNumber?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "La demande est invalide." }, { status: 400 }); }
  const amount = Number(body.amount);
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : "";
  const countryCode = typeof body.countryCode === "string" ? body.countryCode.toUpperCase() : "";
  const network = typeof body.network === "string" ? body.network.trim() : "";
  const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
  const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !/^[A-Z]{2}$/.test(countryCode)
    || network.length < 2 || network.length > 60 || accountName.length < 2 || accountName.length > 120
    || phoneNumber.replace(/[^0-9+]/g, "").length < 7 || phoneNumber.length > 40) {
    return NextResponse.json({ error: "Vérifiez le montant et les coordonnées mobile money." }, { status: 400 });
  }
  let amountStored: number;
  try {
    const digits = currencyFractionDigits(currency);
    if (digits > 2 || amountToStoredUnits(amount, currency) / 100 !== amount) throw new Error("precision");
    amountStored = amountToStoredUnits(amount, currency);
  } catch {
    return NextResponse.json({ error: "Le montant ne respecte pas la précision de cette devise." }, { status: 400 });
  }

  const { data, error } = await admin.rpc("create_payout_request", {
    p_creator_id: authData.user.id,
    p_amount: amountStored,
    p_currency: currency,
    p_country_code: countryCode,
    p_network: network,
    p_account_name: accountName,
    p_phone_number: phoneNumber,
  });
  if (error) {
    if (error.message.includes("insufficient available balance")) return NextResponse.json({ error: "Le solde disponible est insuffisant dans cette devise." }, { status: 409 });
    return NextResponse.json({ error: "La demande de retrait n’a pas pu être enregistrée." }, { status: 400 });
  }
  return NextResponse.json({ request: safeRequest(data as Record<string, unknown>) }, { status: 201 });
}
