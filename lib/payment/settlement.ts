import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { amountToStoredUnits } from "@/lib/payment/accounting.mjs";
import type { SasPayPayment } from "@/lib/payment/saspay";

export function markerFromDescription(description: string | undefined) {
  return description?.match(/Sellow\s+#([A-Z0-9]{12})/i)?.[1]?.toUpperCase() ?? null;
}

export async function finalizeSasPayPayment(input: {
  admin: SupabaseClient;
  payment: SasPayPayment;
  eventKey: string;
  eventType: string;
  expectedOrderId?: string;
  sanitizedPayload?: Record<string, unknown>;
}) {
  const { admin, payment } = input;
  const marker = markerFromDescription(payment.description);
  if (!marker) throw new Error("La transaction ne contient pas la référence de commande Sellow.");

  const { data: order, error: orderError } = await admin.from("orders")
    .select("id, amount, currency, status, provider_marker")
    .eq("provider_marker", marker)
    .eq("provider", "saspay")
    .maybeSingle();
  if (orderError || !order) throw new Error("La commande associée à cette transaction est introuvable.");
  if (input.expectedOrderId && order.id !== input.expectedOrderId) throw new Error("La commande retournée ne correspond pas au paiement.");
  const status = payment.status.toUpperCase();
  if (!["SUCCESS", "FAILED", "CANCELLED", "PENDING"].includes(status)) {
    throw new Error("SasPay a renvoyé un état de paiement inconnu.");
  }
  if (!Number.isFinite(Number(payment.requested_amount)) || Number(payment.requested_amount) <= 0) {
    throw new Error("SasPay a renvoyé un montant invalide.");
  }
  if (amountToStoredUnits(Number(payment.requested_amount), String(payment.currency)) !== Number(order.amount)
    || String(payment.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
    throw new Error("Le montant ou la devise confirmés ne correspondent pas à la commande.");
  }
  const amount = amountToStoredUnits(Number(payment.requested_amount), String(payment.currency));
  const rawNetAmount = Number(payment.net_amount);
  const merchantNetAmount = Number.isFinite(rawNetAmount) && rawNetAmount >= 0
    ? amountToStoredUnits(rawNetAmount, String(payment.currency))
    : 0;
  const mode = String(payment.fee_charge_mode ?? "").toUpperCase();
  if (status === "SUCCESS" && mode !== "DEDUCTED") {
    throw new Error("Le mode de frais du paiement confirmé ne correspond pas au checkout.");
  }
  if (status === "SUCCESS" && (merchantNetAmount <= 0 || merchantNetAmount > amount)) {
    throw new Error("Le montant net confirmé par SasPay est incohérent.");
  }
  const processorFeeAmount = status === "SUCCESS" ? amount - merchantNetAmount : 0;
  const payload = input.sanitizedPayload ?? {};

  const { data, error } = await admin.rpc("finalize_saspay_event", {
    p_event_key: input.eventKey,
    p_event_type: input.eventType,
    p_provider_transaction_id: payment.id,
    p_transaction_reference: payment.reference ?? null,
    p_order_id: order.id,
    p_verified_status: status,
    p_verified_amount: amount,
    p_verified_currency: String(payment.currency).toUpperCase(),
    p_processor_fee_amount: processorFeeAmount,
    p_merchant_net_amount: merchantNetAmount,
    p_fee_charge_mode: mode || null,
    p_sanitized_payload: payload,
  });
  if (error) throw new Error(error.message);
  return { orderId: order.id, duplicate: data === false, status };
}

export function sanitizedSasPayPayload(value: Record<string, unknown>) {
  const allowedKeys = ["id", "reference", "type", "status", "amount", "fee", "charged", "net_amount", "fee_charge_mode", "currency", "country", "network"];
  return Object.fromEntries(allowedKeys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}
