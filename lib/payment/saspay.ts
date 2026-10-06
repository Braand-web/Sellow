import "server-only";

export const SASPAY_API_BASE = "https://api.saspay.me/api/v1";

export type SasPayCheckoutSession = {
  id: string;
  checkout_url: string;
  status: string;
  fee_charge_mode?: string;
};

export type SasPayPayment = {
  id: string;
  reference?: string;
  requested_amount: string;
  net_amount: string;
  currency: string;
  status: string;
  fee_charge_mode?: string;
  client_fee?: string;
  gateway_fee?: string;
  platform_fee?: string;
  debited_amount?: string;
  charged?: string;
  description?: string;
};

export type SasPaySessionStatus = {
  id: string;
  status: string;
  transaction_id?: string | null;
  transaction_status?: string | null;
  transaction_reference?: string | null;
};

export class SasPayClient {
  constructor(private readonly apiKey = process.env.SASPAY_API_KEY) {
    if (!apiKey) throw new Error("La clé SasPay côté serveur n’est pas configurée.");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${SASPAY_API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const providerMessage = typeof payload.message === "string" ? payload.message : "SasPay n’a pas accepté la demande.";
      throw new Error(providerMessage);
    }
    return payload as T;
  }

  createCheckout(input: {
    orderId: string;
    marker: string;
    amount: string;
    currency: string;
    customerEmail: string;
    customerName: string;
    productTitle: string;
    returnUrl: string;
  }) {
    return this.request<SasPayCheckoutSession>("/checkout-sessions/", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        customer_email: input.customerEmail,
        customer_name: input.customerName,
        description: `Sellow #${input.marker} · ${input.productTitle}`.slice(0, 240),
        return_url: input.returnUrl,
        metadata: { sellow_order_id: input.orderId, sellow_marker: input.marker },
        fee_charge_mode: "DEDUCTED",
      }),
    });
  }

  getCheckoutSessionStatus(sessionId: string) {
    return this.request<SasPaySessionStatus>(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`);
  }

  cancelCheckoutSession(sessionId: string) {
    return this.request<Record<string, unknown>>(`/checkout-sessions/${encodeURIComponent(sessionId)}/cancel/`, { method: "POST" });
  }

  verifyPayment(paymentId: string) {
    return this.request<SasPayPayment>(`/payments/${encodeURIComponent(paymentId)}/verify/`);
  }
}

export function getSasPayWebhookSecret() {
  return process.env.SASPAY_WEBHOOK_SECRET ?? "";
}
