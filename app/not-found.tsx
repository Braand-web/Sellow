import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

export default function NotFound() {
  return <section className="not-found"><div><p className="page-eyebrow">Erreur 404</p><h1>Cette page est introuvable</h1><p>Le lien a pu changer. Revenez à l’accueil pour explorer les produits ou ouvrir votre boutique.</p><Link className="button button-dark" href="/"><ArrowLeft size={16} /> Retour à l’accueil</Link></div></section>;
}
