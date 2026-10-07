// User-facing wording shared by browser components and server responses.
export const brandCopy = {
  headline: "Découvrez des créations. Vendez les vôtres.",
  description: "Ressources numériques, cours, abonnements, objets et services\u00a0: achetez auprès de créateurs indépendants ou ouvrez votre propre boutique.",
  title: "Sellow — Découvrez des créations, vendez les vôtres",
  explore: "Explorer les produits",
  createShop: "Créer ma boutique",
};

export const paymentCopy = {
  continue: "Continuer vers le paiement",
  confirmed: "Paiement confirmé",
  fees: "Frais de traitement",
  reference: "Référence du versement",
  introduction: "Vous allez ouvrir une page de paiement pour choisir votre moyen de paiement.",
  privacy: "Vos informations de paiement sont saisies sur une page dédiée. Sellow reçoit la confirmation de votre commande.",
  unavailable: "Le paiement est temporairement indisponible. Réessayez plus tard.",
  verificationUnavailable: "L’état du paiement n’a pas pu être vérifié. Réessayez.",
  pending: "Votre achat sera disponible dès que le paiement sera confirmé.",
  unconfirmed: "Vous pouvez vérifier à nouveau l’état de votre paiement ou revenir à la fiche du produit.",
  demo: "Démonstration sans paiement réel",
};

export const membershipCopy = {
  renewal: "Vous payez un mois d’accès à la fois. Le renouvellement est manuel, sans prélèvement automatique.",
  cancellation: "Le renouvellement est arrêté. Votre accès reste disponible jusqu’à la fin de la période payée.",
};

export const commissionCopy = "La commission Sellow est de 10 % du prix brut des ventes confirmées, puis de 5 % sur les nouveaux paiements après 5 000 $ de ventes brutes confirmées cumulées. Les frais de traitement sont déduits séparément du montant dû au créateur.";

export function checkoutConfirmation(kind, demo = false) {
  const confirmations = {
    download: ["Vos fichiers sont disponibles", "Retrouvez vos fichiers dans votre bibliothèque pour les télécharger."],
    course: ["Votre cours est disponible", "Ouvrez le cours depuis votre bibliothèque et avancez à votre rythme."],
    membership: ["Votre espace membre est ouvert", "Retrouvez les publications et les cours inclus dans votre abonnement."],
    physical: ["Votre commande est confirmée", demo ? "Aucun colis ne sera expédié pour cette commande simulée." : "Le créateur organise l’envoi à l’adresse indiquée dans votre commande."],
    service: ["Votre prestation est commandée", demo ? "Cette demande simulée ne déclenche aucune prestation." : "La prestation sera organisée directement avec le créateur selon les modalités de son offre."],
  };
  const [title, description] = confirmations[kind] ?? ["Votre commande est confirmée", "Retrouvez les détails de votre commande dans votre bibliothèque."];
  return { title, description };
}

// Technical details belong in diagnostics, never in a toast or a public error.
export function publicErrorMessage(error, fallback = "Cette action n’a pas abouti. Réessayez.") {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!message.trim() || message.length > 400 || /\b(saspay(?:_\w+)?|supabase(?:_\w+)?|postgres(?:ql)?|sqlstate|stack|schema|rls|jwt|service_role|api[_ ]?key)\b|https?:\/\/|fetch failed|internal server|networkerror/i.test(message)) return fallback;
  return message;
}
