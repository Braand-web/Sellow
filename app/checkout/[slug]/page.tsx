import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout-page";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay" ? "Paiement sécurisé" : "Commande de démonstration",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <CheckoutPage guestCheckoutEnabled={process.env.GUEST_CHECKOUT_ENABLED === "true" && process.env.EMAIL_OTP_ENABLED === "true"} emailOtpEnabled={process.env.EMAIL_OTP_ENABLED === "true"} />;
}
