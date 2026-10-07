import type { Metadata } from "next";
import { PurchaseRecoveryPage } from "@/components/purchase-recovery-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Retrouver mes achats", robots: { index: false, follow: false } };
export default function Page() { return <PurchaseRecoveryPage enabled={process.env.EMAIL_OTP_ENABLED === "true"} />; }
