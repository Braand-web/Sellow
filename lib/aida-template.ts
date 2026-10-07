import type { RichTextDocument } from "@/lib/rich-text";

export function aidaTemplate(): RichTextDocument {
  const heading = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
  const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  return { type: "doc", content: [
    heading("Un résultat concret pour votre client"),
    paragraph("Présentez le problème de votre client et le résultat auquel votre produit peut l’aider à parvenir."),
    heading("Pourquoi ce produit peut vous aider"),
    paragraph("Décrivez la situation de votre client, les difficultés rencontrées et votre approche pour l’accompagner."),
    heading("Ce que vous recevez"),
    { type: "bulletList", content: ["Votre premier contenu et son bénéfice", "Votre deuxième contenu et son bénéfice", "Vos ressources et les modalités d’accès"].map((text) => ({ type: "listItem", content: [paragraph(text)] })) },
    paragraph("Ajoutez ici vos images et aperçus avec les boutons de la barre d’outils. Utilisez des éléments vérifiables et vos propres visuels."),
    heading("À vous de passer à l’action"),
    paragraph("Rappelez à qui s’adresse votre produit, son prix et ce qui se passe après l’achat. Invitez votre client à commander."),
  ] };
}
