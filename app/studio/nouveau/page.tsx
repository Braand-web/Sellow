import type { Metadata } from "next";
import { NewProductPage } from "@/components/new-product-page";

export const metadata: Metadata = { title: "Créer un produit" };

export default function Page() {
  return <NewProductPage />;
}
