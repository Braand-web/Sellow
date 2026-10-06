import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";
import { getProductMetadata } from "@/lib/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return getProductMetadata((await params).slug);
}

export default function Page() {
  return <ProductPage />;
}
