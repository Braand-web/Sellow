function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
export function receiptMessage(order, appUrl = "https://sellow.fun") {
  const base = new URL(appUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") throw new Error("Invalid application URL");
  const link = new URL(`/achats/retrouver?commande=${encodeURIComponent(order.id)}`, base).href;
  const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: order.currency }).format(Number(order.amount) / 100);
  const detail = order.product_kind === "membership" ? "Votre accès se renouvelle manuellement chaque mois, sans prélèvement automatique."
    : order.product_kind === "physical" ? "Le créateur organise l’expédition de votre commande."
    : order.product_kind === "service" ? "La prestation est organisée directement avec le créateur."
    : "Vérifiez votre adresse e-mail pour retrouver votre contenu.";
  const text = `Sellow\n\nPaiement confirmé\n${order.product_title}\nMontant : ${amount}\nCommande : ${order.id}\n\n${detail}\n\nRetrouver mon achat : ${link}\nUn code envoyé à votre adresse e-mail protège l’accès à vos achats.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#222"><h2>Sellow</h2><h1>Paiement confirmé</h1><p>${escapeHtml(order.product_title)}</p><p><strong>${escapeHtml(amount)}</strong></p><p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#222;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Retrouver mon achat</a></p><p>Un code envoyé à votre adresse e-mail protège l’accès à vos achats.</p><p style="color:#666;font-size:12px">Commande ${escapeHtml(order.id)}</p></div>`;
  return { subject: "Votre achat Sellow est confirmé", html, text };
}
export function emailRetry(attempts, now = Date.now()) {
  return { status: attempts >= 6 ? "failed" : "pending", nextAttemptAt: new Date(now + [1, 5, 15, 60, 180, 360][Math.min(Math.max(attempts - 1, 0), 5)] * 60000).toISOString() };
}
