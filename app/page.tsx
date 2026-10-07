import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { brandCopy } from "@/lib/copy.mjs";

export const metadata: Metadata = {
  title: brandCopy.title,
  description: "Découvrez des ressources numériques, des cours, des abonnements, des objets et des services, ou ouvrez votre boutique sur Sellow.",
};

export default function Page() {
  return <HomePage />;
}
