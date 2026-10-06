import { NextResponse } from "next/server";
import { REDUCED_COMMISSION_RATE, REDUCED_COMMISSION_THRESHOLD_USD, STANDARD_COMMISSION_RATE, storedUnitsToAmount } from "@/lib/payment/accounting.mjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const authClient = await getSupabaseServerClient();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const admin = getSupabaseAdmin();
  if (!authData.user || !admin) return NextResponse.json({ error: "Connectez-vous à votre compte créateur." }, { status: 401 });

  const [{ data: orders, error: ordersError }, { data: requests, error: requestsError }] = await Promise.all([
    admin.from("orders").select("currency, amount, commission_amount, processor_fee_amount, merchant_net_amount, creator_net_amount, sales_usd, paid_at")
      .eq("creator_id", authData.user.id).eq("provider", "saspay").eq("status", "paid"),
    admin.from("payout_requests").select("currency, amount, status")
      .eq("creator_id", authData.user.id).in("status", ["requested", "approved", "paid"]),
  ]);
  if (ordersError || requestsError) return NextResponse.json({ error: "Les revenus n’ont pas pu être chargés." }, { status: 500 });

  const rows = orders ?? [];
  const payoutRows = requests ?? [];
  const currencies = [...new Set([...rows.map((row) => String(row.currency)), ...payoutRows.map((row) => String(row.currency))])].sort();
  const balances = currencies.map((currency) => {
    const currencyOrders = rows.filter((row) => row.currency === currency);
    const currencyRequests = payoutRows.filter((row) => row.currency === currency);
    const gross = currencyOrders.reduce((sum, row) => sum + Number(row.amount), 0);
    const commission = currencyOrders.reduce((sum, row) => sum + Number(row.commission_amount), 0);
    const providerFees = currencyOrders.reduce((sum, row) => sum + Number(row.processor_fee_amount), 0);
    const creatorNet = currencyOrders.reduce((sum, row) => sum + Number(row.creator_net_amount ?? 0), 0);
    const reserved = currencyRequests.reduce((sum, row) => sum + Number(row.amount), 0);
    return {
      currency,
      gross: storedUnitsToAmount(gross),
      commission: storedUnitsToAmount(commission),
      processorFees: storedUnitsToAmount(providerFees),
      net: storedUnitsToAmount(creatorNet),
      reserved: storedUnitsToAmount(reserved),
      available: storedUnitsToAmount(Math.max(0, creatorNet - reserved)),
    };
  });
  const lifetimeSalesUsd = rows.reduce((sum, row) => sum + Number(row.sales_usd ?? 0), 0);
  return NextResponse.json({
    balances,
    lifetimeSalesUsd,
    commissionRate: lifetimeSalesUsd >= REDUCED_COMMISSION_THRESHOLD_USD ? REDUCED_COMMISSION_RATE : STANDARD_COMMISSION_RATE,
    standardCommissionRate: STANDARD_COMMISSION_RATE,
    reducedCommissionRate: REDUCED_COMMISSION_RATE,
    reducedCommissionThresholdUsd: REDUCED_COMMISSION_THRESHOLD_USD,
    paidOrderCount: rows.length,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
