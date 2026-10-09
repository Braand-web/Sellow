import { Suspense } from "react";
import type { Metadata } from "next";
import { MessagesPage } from "@/components/messages-page";
export const metadata: Metadata = {
  title: "Messages",
  description: "Vos échanges privés avec les créateurs Sellow.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Suspense
      fallback={<div className="page-wrap">Chargement des messages…</div>}
    >
      <MessagesPage />
    </Suspense>
  );
}
