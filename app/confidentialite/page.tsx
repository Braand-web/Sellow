import type { Metadata } from "next";

export const metadata: Metadata = { title: "Confidentialité" };

export default function Page() {
  return <article className="page-wrap"><p className="page-eyebrow">Informations</p><h1 className="page-title">Confidentialité</h1><div className="legal-copy"><p>Cette démonstration enregistre les produits, préférences et commandes simulées dans le stockage local du navigateur. Ces informations restent sur cet appareil tant que vous ne les effacez pas.</p><h2>Compte local</h2><p>Sans configuration Supabase, l’inscription crée un compte de démonstration dans votre navigateur. N’utilisez pas un mot de passe que vous utilisez sur un autre service.</p><h2>Configuration Supabase</h2><p>Lorsque Supabase est configuré, les comptes et produits publiés peuvent être enregistrés dans le projet connecté. Appliquez les règles de sécurité fournies avec le prototype avant d’y stocker des données personnelles.</p><h2>Paiements</h2><p>Aucune coordonnée bancaire n’est demandée. Le checkout de démonstration ne contacte aucun prestataire de paiement.</p></div></article>;
}
