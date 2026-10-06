import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand-block">
          <Link className="brand brand-footer" href="/">
            <BrandMark />
            <span>Sellow</span>
          </Link>
          <p>Des idées faites par des gens qui les partagent.</p>
        </div>
        <div className="footer-links">
          <div><span className="footer-heading">Explorer</span><Link href="/#decouvrir">Produits</Link><Link href="/#categories">Catégories</Link></div>
          <div><span className="footer-heading">Créer</span><Link href="/inscription">Ouvrir une boutique</Link><Link href="/studio">Espace créateur</Link></div>
          <div><span className="footer-heading">Informations</span><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link></div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Sellow. Fait pour les idées indépendantes.</span>
        <span className="footer-demo"><i /> {liveMode ? "Paiements traités par SasPay" : "Démonstration sans paiement réel"}</span>
        <Link href="/#haut">Retour en haut <ArrowUpRight size={14} /></Link>
      </div>
    </footer>
  );
}
