import type { Metadata } from "next";
import { OrderContentPage } from "@/components/order-content-page";

export const metadata: Metadata = { title: "Contenu acheté" };

export default function Page() {
  return <OrderContentPage />;
}
