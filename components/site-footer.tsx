import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand-block">
          <Link className="brand brand-footer" href="/">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>gumroad</span>
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
        <span>© 2026 Gumroad. Fait pour les idées indépendantes.</span>
        <span className="footer-demo"><i /> Démonstration sans paiement réel</span>
        <Link href="/#haut">Retour en haut <ArrowUpRight size={14} /></Link>
      </div>
    </footer>
  );
}
