import type { Metadata } from "next";

export const metadata: Metadata = { title: "Confidentialité" };

export default function Page() {
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";

  return (
    <article className="page-wrap">
      <p className="page-eyebrow">Informations</p>
      <h1 className="page-title">Confidentialité</h1>
      <div className="legal-copy">
        {liveMode ? <>
          <p>Pour faire fonctionner Sellow, la plateforme traite les informations de compte, les fiches produits, les commandes et les droits d’accès associés. Ces informations sont enregistrées dans les services utilisés par Sellow pour gérer les comptes et les commandes.</p>
          <h2>Informations de commande</h2>
          <p>Une commande peut contenir l’adresse e mail de l’acheteur, le produit choisi, son montant et sa devise. Pour une livraison physique, l’adresse de livraison est également enregistrée. Pour un service, le message transmis au créateur est joint à la commande.</p>
          <h2>Paiements</h2>
          <p>Les informations de paiement sont saisies sur une page hébergée par notre prestataire de paiement. Sellow reçoit les références et l’état nécessaires pour vérifier la commande et ouvrir les accès. Ne partagez pas vos informations de paiement dans un message ou un champ de commande.</p>
          <h2>Contenus numériques</h2>
          <p>Les fichiers et contenus privés sont accessibles au créateur concerné et aux acheteurs ou membres autorisés par leurs droits d’accès.</p>
        </> : <>
          <p>Cette démonstration enregistre les produits, préférences et commandes simulées dans le stockage local du navigateur. Ces informations restent sur cet appareil tant que vous ne les effacez pas.</p>
          <h2>Compte local</h2>
          <p>En mode local, l’inscription crée un compte de démonstration dans votre navigateur. N’utilisez pas un mot de passe que vous utilisez sur un autre service.</p>
          <h2>Comptes connectés</h2>
          <p>Lorsque le service utilise des comptes connectés, les informations de compte et les produits publiés sont enregistrés par Sellow. Les fichiers privés sont soumis aux droits d’accès de leur propriétaire et des acheteurs autorisés.</p>
          <h2>Paiements</h2>
          <p>Aucune coordonnée bancaire n’est demandée. Le parcours de démonstration ne contacte aucun prestataire de paiement.</p>
        </>}
      </div>
    </article>
  );
}
