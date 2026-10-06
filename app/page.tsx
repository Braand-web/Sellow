import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";

export const metadata: Metadata = {
  title: "Découvrir des créations indépendantes",
  description: "Explorez des fichiers, des cours, des abonnements et des objets créés par des indépendants.",
};

export default function Page() {
  return <HomePage />;
}
