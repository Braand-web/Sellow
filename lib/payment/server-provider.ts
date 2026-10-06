import "server-only";
import { SasPayClient, type SasPayCheckoutSession, type SasPayPayment } from "@/lib/payment/saspay";

export type HostedCheckoutRequest = {
  orderId: string;
  marker: string;
  amount: string;
  currency: string;
  customerEmail: string;
  customerName: string;
  productTitle: string;
  returnUrl: string;
};

export interface HostedPaymentProvider {
  createCheckout(input: HostedCheckoutRequest): Promise<SasPayCheckoutSession>;
  verifyPayment(paymentId: string): Promise<SasPayPayment>;
  getCheckoutSessionStatus(sessionId: string): ReturnType<SasPayClient["getCheckoutSessionStatus"]>;
  cancelCheckoutSession(sessionId: string): ReturnType<SasPayClient["cancelCheckoutSession"]>;
}

export class SasPayPaymentProvider implements HostedPaymentProvider {
  private readonly client: SasPayClient;

  constructor(client = new SasPayClient()) {
    this.client = client;
  }

  createCheckout(input: HostedCheckoutRequest) {
    return this.client.createCheckout(input);
  }

  verifyPayment(paymentId: string) {
    return this.client.verifyPayment(paymentId);
  }

  getCheckoutSessionStatus(sessionId: string) {
    return this.client.getCheckoutSessionStatus(sessionId);
  }

  cancelCheckoutSession(sessionId: string) {
    return this.client.cancelCheckoutSession(sessionId);
  }
}
