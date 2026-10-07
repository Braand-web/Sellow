import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout-page";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay" ? "Paiement sécurisé" : "Commande de démonstration",
};

export default function Page() {
  return <CheckoutPage />;
}
