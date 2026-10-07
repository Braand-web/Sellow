export const CHECKOUT_UNAVAILABLE_MESSAGE: string;
export function unwrapSasPayResponse(value: unknown): unknown;
export function normalizeSasPayFeeMode(value: unknown): "DEDUCTED" | "ADD_ON" | null;
export type SasPayCheckoutCheck = {
  outcome: "CONFIRMED" | "FEE_MODE_UNCONFIRMED" | "FEE_MODE_MISMATCH" | "INVALID_SESSION" | "SESSION_UNAVAILABLE";
  sessionId: string | null;
  storedCheckoutUrl: string | null;
  checkoutUrl: string | null;
  feeMode: "DEDUCTED" | "ADD_ON" | null;
  providerStatus: string | null;
  diagnostic: {
    sessionId: string | null;
    creationFeeMode: string;
    detailFeeMode: string;
    detailResult: string;
  };
};
export function checkSasPayCheckout(
  provider: { getCheckoutSession(sessionId: string): Promise<unknown> },
  session: unknown,
  options?: { refresh?: boolean },
): Promise<SasPayCheckoutCheck>;
