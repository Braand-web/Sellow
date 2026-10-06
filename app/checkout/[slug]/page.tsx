import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout-page";

export const metadata: Metadata = { title: "Checkout de démonstration" };

export default function Page() {
  return <CheckoutPage />;
}
