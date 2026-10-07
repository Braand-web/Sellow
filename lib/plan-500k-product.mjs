export const guideSlug = "le-plan-500k-afrique";
export const guideSellerEmail = "bleuebrand@gmail.com";

export function createGuideDescription(images) {
  const text = (value, bold = false) => ({ type: "text", text: value, ...(bold ? { marks: [{ type: "bold" }] } : {}) });
  const paragraph = (...content) => ({ type: "paragraph", content: content.map((item) => typeof item === "string" ? text(item) : item) });
  const heading = (value) => ({ type: "heading", attrs: { level: 2 }, content: [{ ...text(value), marks: [{ type: "textStyle", attrs: { color: "#123ba7" } }] }] });
  const list = (items) => ({ type: "bulletList", content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })) });
  const image = (src, alt) => ({ type: "image", attrs: { src, alt } });
  return { type: "doc", content: [
    heading("Votre idée mérite un plan. Construisez-la, testez-la, vendez-la."),
    paragraph("Vous voulez créer un SaaS ou un site web utile en Afrique francophone, mais vous ne savez pas quelle idée choisir, comment la construire ni comment trouver vos premiers clients ? ", text("Le Plan 500K Afrique", true), " vous aide à transformer cette envie en étapes concrètes."),
    image(images.overview, "Le Plan 500K Afrique : 26 pages, 15 idées ciblées, 90 jours d’action et 20 prompts Coden"),
    heading("Moins d’hésitation, une prochaine action claire"),
    paragraph("Une idée seule ne suffit pas. Il faut vérifier qu’un problème existe, concevoir une première version utile, fixer un prix et proposer un paiement adapté à vos clients. Sans méthode, on peut passer des semaines à construire avant même d’avoir parlé à un prospect."),
    paragraph("Ce guide vous accompagne de la validation de l’idée jusqu’à l’acquisition et à la fidélisation. Il tient compte du terrain : échanges sur WhatsApp, besoins des petites entreprises, mobile money et budgets à piloter."),
    heading("Ce que les 26 pages vous aident à préparer"),
    list([
      "Choisir parmi 15 idées ciblées, puis vérifier l’intérêt de vrais prospects avant d’investir davantage.",
      "Définir votre première version et structurer sa création avec des prompts pour Coden.",
      "Construire une offre et un prix adaptés au problème résolu et au profil de votre client.",
      "Comprendre les options de paiement en Afrique et les points à vérifier avant une intégration.",
      "Préparer votre prospection WhatsApp, vos contenus organiques et vos premiers tests publicitaires.",
      "Suivre un plan sur 90 jours avec des priorités hebdomadaires et des indicateurs mesurables.",
    ]),
    heading("Jetez un œil au contenu du guide"),
    paragraph("Fondations, validation, construction, monétisation, paiements, acquisition, publicité, exécution et fidélisation : les chapitres suivent les décisions que vous devrez prendre pour lancer votre projet."),
    image(images.contents, "Aperçu sélectionné du sommaire du guide — page 2"),
    paragraph({ ...text("Aperçu du sommaire · page 2"), marks: [{ type: "italic" }] }),
    heading("Un plan de 90 jours pour avancer semaine après semaine"),
    paragraph("Commencez par des conversations avec vos prospects. Validez un problème, préparez une offre, construisez une première version, puis mesurez vos actions de vente. Le plan vous donne une progression sur 13 semaines, à adapter à votre situation."),
    image(images.roadmap, "Aperçu sélectionné du plan sur 13 semaines et du tableau de bord — page 17"),
    paragraph({ ...text("Aperçu du plan d’action · page 17"), marks: [{ type: "italic" }] }),
    heading("Les bonus sont déjà dans votre PDF"),
    list([
      "20 prompts Coden pour préparer et construire votre produit.",
      "Des scripts et modèles de messages WhatsApp pour vos prises de contact et vos relances.",
      "30 accroches pour vous aider à préparer vos contenus.",
      "Une structure de page de vente et des scripts de closing.",
      "Des checklists de lancement, de vente et de fidélisation, une fiche de validation et un calculateur de chiffre d’affaires.",
    ]),
    paragraph(text("Tout est inclus dans le même guide PDF.", true), " Les outils et abonnements externes, dont Coden, ne sont pas inclus dans l’achat."),
    heading("Pour qui ce guide est-il conçu ?"),
    paragraph("Pour les indépendants, porteurs de projet et entrepreneurs d’Afrique francophone qui veulent lancer un SaaS ou un site web monétisable et ont besoin d’un cadre pratique pour organiser leur travail. Le guide se lit à votre rythme et s’utilise comme une feuille de route."),
    { type: "blockquote", content: [paragraph(text("500 000 FCFA par mois est un objectif de chiffre d’affaires brut avant dépenses.", true), " Ce n’est pas une promesse de revenus ni une garantie de résultat en 90 jours. Vos résultats dépendent notamment du besoin choisi, de votre offre, de votre exécution et de vos coûts.")] },
    heading("Passez de « j’ai une idée » à « voici ma prochaine étape »"),
    paragraph("Recevez ", text("Le Plan 500K Afrique pour 5 000 FCFA XAF", true), ", avec un prix de référence de 25 000 FCFA XAF. Après confirmation du paiement, retrouvez le PDF de 26 pages et ses bonus dans votre bibliothèque Sellow."),
    paragraph(text("Commandez le guide et commencez par la première étape : choisir un problème utile à résoudre.", true)),
  ] };
}

export function guidePlainText(document) {
  const walk = (node) => node.type === "text" ? node.text : (node.content ?? []).map(walk).join(node.type === "doc" || node.type === "bulletList" ? "\n" : "");
  return walk(document);
}
