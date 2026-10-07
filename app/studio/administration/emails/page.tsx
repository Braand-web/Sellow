import { AdminEmailsPage } from "@/components/admin-emails-page";
export const dynamic = "force-dynamic";
import { getSellowAdminContext } from "@/lib/supabase/admin-auth";
import { redirect } from "next/navigation";
export const metadata = { title: "Reçus et récupération des achats", robots: { index: false, follow: false } };
export default async function Page() {
  const context = await getSellowAdminContext();
  if (!context) redirect("/connexion?next=%2Fstudio%2Fadministration%2Femails");
  return <AdminEmailsPage />;
}
