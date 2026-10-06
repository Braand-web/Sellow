import type { Metadata } from "next";
import { CreatorPage } from "@/components/creator-page";
import { getCreatorMetadata } from "@/lib/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return getCreatorMetadata((await params).slug);
}

export default function Page() {
  return <CreatorPage />;
}
