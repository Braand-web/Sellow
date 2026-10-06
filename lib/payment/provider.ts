import type { Product } from "@/lib/types";

export type CheckoutRequest = {
  product: Product;
  buyerEmail: string;
  shippingAddress?: string;
};

export type CheckoutResult = {
  provider: "demo";
  reference: string;
  status: "paid_demo";
};

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  cancelSubscription(orderId: string): Promise<{ status: "canceled_demo" }>;
}

/**
 * A deliberately local provider. It never contacts a payment processor and
 * must not be treated as a record of real money movement.
 */
export class DemoPaymentProvider implements PaymentProvider {
  async createCheckout({ product, buyerEmail }: CheckoutRequest): Promise<CheckoutResult> {
    if (!buyerEmail.includes("@")) {
      throw new Error("Saisissez une adresse e-mail valide.");
    }

    if (!product.published) {
      throw new Error("Ce produit n’est plus disponible.");
    }

    return {
      provider: "demo",
      reference: `demo_${crypto.randomUUID()}`,
      status: "paid_demo",
    };
  }

  async cancelSubscription(): Promise<{ status: "canceled_demo" }> {
    return { status: "canceled_demo" };
  }
}

export const paymentProvider: PaymentProvider = new DemoPaymentProvider();
