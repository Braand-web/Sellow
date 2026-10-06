import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

export default function NotFound() {
  return <section className="not-found"><div><p className="page-eyebrow">Erreur 404</p><h1>Cette page n’est pas ici.</h1><p>Revenez à la découverte et trouvez une autre idée.</p><Link className="button button-dark" href="/"><ArrowLeft size={16} /> Retour à l’accueil</Link></div></section>;
}
