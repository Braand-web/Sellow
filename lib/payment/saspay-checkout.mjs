export const CHECKOUT_UNAVAILABLE_MESSAGE = "Le paiement est temporairement indisponible. Réessayez plus tard.";

// The live API wraps its resources in { success, data, code }. Documentation
// also shows bare resources, so support both without accepting failure envelopes.
export function unwrapSasPayResponse(value) {
  const source = record(value);
  if (Object.hasOwn(source, "success")) {
    if (source.success !== true || !Object.hasOwn(source, "data")) {
      throw new Error("SasPay n’a pas confirmé la réussite de la demande.");
    }
    return source.data;
  }
  return value;
}

export function normalizeSasPayFeeMode(value) {
  if (typeof value !== "string") return null;
  const mode = value.trim().toUpperCase();
  return mode === "DEDUCTED" || mode === "ADD_ON" ? mode : null;
}

function feeFieldState(value) {
  if (value === undefined || value === null) return "absent";
  if (typeof value === "string" && !value.trim()) return "empty";
  return normalizeSasPayFeeMode(value) ?? "malformed";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function checkoutUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const hostedPath = url.origin === "https://checkout.saspay.me" && url.pathname !== "/";
    const documentedPath = url.origin === "https://pay.saspay.me" && url.pathname.startsWith("/checkout/");
    return (hostedPath || documentedPath) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

// Only a provider-confirmed mode may produce a URL suitable for redirection.
// Persisted fee modes are deliberately ignored when a session is reused.
export async function checkSasPayCheckout(provider, rawSession, { refresh = false } = {}) {
  const initial = record(rawSession);
  const sessionId = nonemptyString(initial.id);
  const initialMode = refresh ? null : normalizeSasPayFeeMode(initial.fee_charge_mode);
  const diagnostic = {
    sessionId,
    creationFeeMode: refresh ? "not_checked" : feeFieldState(initial.fee_charge_mode),
    detailFeeMode: "not_checked",
    detailResult: "not_checked",
  };
  let current = initial;
  let mode = initialMode;
  let outcome = "FEE_MODE_UNCONFIRMED";

  if (!sessionId) {
    return { outcome: "INVALID_SESSION", sessionId: null, checkoutUrl: null,
      storedCheckoutUrl: null, feeMode: null, providerStatus: null, diagnostic };
  }

  if (refresh || initialMode !== "DEDUCTED") {
    try {
      const detail = record(await provider.getCheckoutSession(sessionId));
      diagnostic.detailFeeMode = feeFieldState(detail.fee_charge_mode);
      if (nonemptyString(detail.id) !== sessionId) {
        diagnostic.detailResult = "session_id_mismatch";
        outcome = "INVALID_SESSION";
        mode = null;
      } else {
        diagnostic.detailResult = "ok";
        current = { ...initial, ...detail };
        // An empty detail does not negate an explicitly incompatible creation response.
        mode = normalizeSasPayFeeMode(detail.fee_charge_mode) ?? initialMode;
      }
    } catch {
      // Never include provider error bodies: they can contain customer or credential data.
      diagnostic.detailResult = "request_failed";
      mode = refresh ? null : initialMode;
    }
  }

  const storedCheckoutUrl = checkoutUrl(current.checkout_url);
  const providerStatus = nonemptyString(current.status)?.toUpperCase() ?? null;
  if (outcome !== "INVALID_SESSION") {
    outcome = mode === "ADD_ON" ? "FEE_MODE_MISMATCH"
      : mode === "DEDUCTED" ? "CONFIRMED" : "FEE_MODE_UNCONFIRMED";
    if (mode === "DEDUCTED" && !storedCheckoutUrl) outcome = "INVALID_SESSION";
    if (providerStatus !== "PENDING") outcome = "SESSION_UNAVAILABLE";
  }

  return {
    outcome, sessionId, storedCheckoutUrl, feeMode: mode, providerStatus,
    checkoutUrl: outcome === "CONFIRMED" ? storedCheckoutUrl : null,
    diagnostic,
  };
}
