import type { Metadata } from "next";
import { PayoutDashboardPage } from "@/components/payout-dashboard-page";

export const metadata: Metadata = { title: "Revenus et retraits" };

export default function Page() {
  return <PayoutDashboardPage />;
}
