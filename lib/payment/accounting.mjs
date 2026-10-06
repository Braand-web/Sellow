export const STANDARD_COMMISSION_RATE = 0.1;
export const REDUCED_COMMISSION_RATE = 0.05;
export const REDUCED_COMMISSION_THRESHOLD_USD = 5000;

export function currencyFractionDigits(currency) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error("Devise invalide.");
  }
}

export function roundCurrencyAmount(amount, currency) {
  const digits = currencyFractionDigits(currency);
  const factor = 10 ** digits;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function amountToStoredUnits(amount, currency) {
  return Math.round(roundCurrencyAmount(amount, currency) * 100);
}

export function storedUnitsToAmount(units) {
  return Number(units) / 100;
}

export function commissionRateForLifetimeSales(lifetimeSalesUsd) {
  return Number(lifetimeSalesUsd) >= REDUCED_COMMISSION_THRESHOLD_USD
    ? REDUCED_COMMISSION_RATE
    : STANDARD_COMMISSION_RATE;
}

export function calculateCommission(amount, currency, rate) {
  return amountToStoredUnits(roundCurrencyAmount(amount * rate, currency), currency);
}

export function calculateCreatorNet(amount, commissionAmount, processorFeeAmount) {
  return Math.max(0, amount - commissionAmount - processorFeeAmount);
}

export function calculateAvailableBalance(paidOrders, payoutRequests, currency) {
  const earned = paidOrders
    .filter((order) => order.currency === currency)
    .reduce((total, order) => total + Number(order.creator_net_amount ?? 0), 0);
  const reserved = payoutRequests
    .filter((request) => request.currency === currency && ["requested", "approved", "paid"].includes(request.status))
    .reduce((total, request) => total + Number(request.amount ?? 0), 0);
  return Math.max(0, earned - reserved);
}

export function addOneMonth(dateValue) {
  const start = new Date(dateValue);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.toISOString();
}
