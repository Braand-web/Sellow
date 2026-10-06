import type { Metadata } from "next";
import { LibraryPage } from "@/components/library-page";

export const metadata: Metadata = { title: "Ma bibliothèque" };

export default function Page() {
  return <LibraryPage />;
}
