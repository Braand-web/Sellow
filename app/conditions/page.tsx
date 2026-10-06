import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conditions d’utilisation" };

export default function Page() {
  return <article className="page-wrap"><p className="page-eyebrow">Informations</p><h1 className="page-title">Conditions d’utilisation</h1><div className="legal-copy"><p>Cette version de Gumroad est un prototype de démonstration. Elle sert à présenter les parcours de découverte, de publication et d’achat.</p><h2>Achats de démonstration</h2><p>Aucun paiement, abonnement ou versement n’est effectué. Les montants, commandes et revenus visibles sont fictifs et ne constituent pas une transaction.</p><h2>Produits et contenus</h2><p>Les produits affichés sont des exemples. Les produits ajoutés en mode local restent enregistrés dans le navigateur utilisé pour la démonstration.</p><h2>Échanges avec les créateurs</h2><p>Les expéditions et prestations visibles dans ce prototype ne sont pas réalisées. Aucune notification n’est envoyée aux créateurs.</p><h2>Disponibilité</h2><p>Le prototype peut évoluer ou être réinitialisé pendant son développement. Il ne doit pas être utilisé pour traiter une commande réelle.</p></div></article>;
}
