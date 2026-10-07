import type { Metadata } from "next";
import { commissionCopy, membershipCopy } from "@/lib/copy.mjs";

export const metadata: Metadata = { title: "Conditions d’utilisation" };

export default function Page() {
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";

  return (
    <article className="page-wrap">
      <p className="page-eyebrow">Informations</p>
      <h1 className="page-title">Conditions d’utilisation</h1>
      <div className="legal-copy">
        {liveMode ? <>
          <p>Sellow met en relation des créateurs indépendants avec des personnes qui souhaitent acheter leurs produits ou services. Les fiches de démonstration ne sont pas proposées au paiement réel.</p>
          <h2>Commandes et paiements</h2>
          <p>Pour les produits proposés à la vente, le paiement est effectué sur une page hébergée par notre prestataire de paiement. Une commande est confirmée après vérification de son paiement. Les accès numériques sont alors ouverts dans la bibliothèque de l’acheteur.</p>
          <p>{membershipCopy.renewal} L’annulation du renouvellement conserve l’accès jusqu’à la fin de la période payée.</p>
          <h2>Produits et livraisons</h2>
          <p>Le créateur décrit son offre et reste chargé de préparer les objets physiques et d’organiser les prestations avec ses clients. Les produits numériques sont accessibles selon les droits associés à la commande.</p>
          <h2>Commission et retraits des créateurs</h2>
          <p>{commissionCopy} Les retraits sont demandés dans Sellow. Le montant est réservé pendant l’examen de la demande, puis versé manuellement après approbation.</p>
        </> : <>
          <p>Cette version locale de Sellow présente les parcours de découverte, de publication et d’achat.</p>
          <h2>Achats de démonstration</h2>
          <p>Aucun paiement, abonnement ou versement n’est effectué. Les montants, commandes et revenus visibles sont fictifs et ne constituent pas une transaction.</p>
          <h2>Produits et contenus</h2>
          <p>Les produits affichés sont des exemples. Les produits ajoutés en mode local restent enregistrés dans le navigateur utilisé pour la démonstration.</p>
          <h2>Échanges avec les créateurs</h2>
          <p>Les expéditions et prestations visibles dans ce prototype ne sont pas réalisées. Aucune notification n’est envoyée aux créateurs.</p>
          <h2>Disponibilité</h2>
          <p>Le prototype peut évoluer ou être réinitialisé pendant son développement. Il ne doit pas être utilisé pour traiter une commande réelle.</p>
        </>}
      </div>
    </article>
  );
}
