import type { Metadata } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@/app/globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { MarketplaceProvider } from "@/app/providers";
import { GlobalNotice } from "@/components/global-notice";

export const metadata: Metadata = {
  metadataBase: new URL("https://sellow.fun"),
  title: {
    default: "Sellow — Des idées à partager",
    template: "%s — Sellow",
  },
  description:
    "Découvrez des ressources, des cours et des objets imaginés par des créateurs indépendants.",
  openGraph: {
    title: "Sellow — Des idées à partager",
    description: "Des créations indépendantes, à découvrir et à partager.",
    type: "website",
    images: ["/og-image.svg"],
  },
  icons: { icon: "/sellow-icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <MarketplaceProvider>
          <a className="skip-link" href="#contenu">Aller au contenu</a>
          <SiteHeader />
          <main id="contenu">{children}</main>
          <SiteFooter />
          <GlobalNotice />
        </MarketplaceProvider>
      </body>
    </html>
  );
}
