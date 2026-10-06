import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Créer un compte" };

export default function Page() {
  return <AuthForm mode="signup" />;
}
