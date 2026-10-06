import type { Metadata } from "next";
import { EditProductPage } from "@/components/edit-product-page";

export const metadata: Metadata = { title: "Modifier un produit" };

export default function Page() {
  return <EditProductPage />;
}
