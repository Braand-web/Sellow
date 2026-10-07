import { pathToFileURL } from "node:url";
import { checkSasPayCheckout, unwrapSasPayResponse } from "../lib/payment/saspay-checkout.mjs";

// Run only on explicit request in an environment holding the server secret.
// This creates and cancels one unpaid session, without an order or entitlement.
export async function diagnoseSasPayCheckout({ apiKey, fetcher = fetch }) {
  if (!apiKey || apiKey === "[SENSITIVE]") throw new Error("Server API key unavailable");
  const request = async (path, init = {}) => {
    const response = await fetcher(`https://api.saspay.me/api/v1${path}`, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${apiKey}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
    if (!response.ok) throw new Error(`SasPay HTTP ${response.status}`);
    return unwrapSasPayResponse(await response.json());
  };
  const raw = await request("/checkout-sessions/", {
    method: "POST",
    body: JSON.stringify({
      amount: "12.00", currency: "EUR", fee_charge_mode: "DEDUCTED",
      customer_email: "checkout-validation@example.com",
      customer_name: "Validation technique Sellow",
      description: "Sellow : vérification technique des frais, aucun achat",
      return_url: "https://sellow.fun/",
      metadata: { purpose: "sellow_fee_mode_validation", no_purchase: true },
    }),
  });
  const checked = await checkSasPayCheckout({
    getCheckoutSession: (id) => request(`/checkout-sessions/${encodeURIComponent(id)}/`),
  }, raw);
  let cancellation = "not_possible";
  if (checked.sessionId) {
    try {
      await request(`/checkout-sessions/${encodeURIComponent(checked.sessionId)}/cancel/`, { method: "POST" });
      cancellation = "confirmed";
    } catch {
      cancellation = "request_failed";
    }
  }
  return {
    outcome: checked.outcome, requestedFeeMode: "DEDUCTED", amount: "12.00", currency: "EUR",
    providerStatus: checked.providerStatus, ...checked.diagnostic, cancellation,
    checkoutOrigin: (() => { try { return new URL(raw?.checkout_url).origin; } catch { return null; } })(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.SASPAY_VALIDATE_CHECKOUT === "true") {
    try {
      const diagnostic = await diagnoseSasPayCheckout({ apiKey: process.env.SASPAY_API_KEY });
      console.log("SASPAY_CHECKOUT_VALIDATION", JSON.stringify(diagnostic));
      if (diagnostic.outcome !== "CONFIRMED" || diagnostic.cancellation !== "confirmed") process.exitCode = 1;
    } catch (error) {
      const httpStatus = error instanceof Error ? error.message.match(/^SasPay HTTP (\d{3})$/)?.[1] : null;
      console.error("SASPAY_CHECKOUT_VALIDATION", JSON.stringify({ outcome: "REQUEST_FAILED", httpStatus: httpStatus ?? null }));
      process.exitCode = 1;
    }
  } else {
    console.log("Validation SasPay non demandée : aucune session créée.");
  }
}
