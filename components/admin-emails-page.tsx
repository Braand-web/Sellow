"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, FormEvent } from "react";

type EmailRow = { id: string; order_id: string; recipient: string; status: string; attempts: number; last_error?: string; orders: { product_title: string; purchase_identity: string; guest_claimed_at?: string; buyer_id?: string; status: string } | null };
export function AdminEmailsPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/emails", { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Les reçus n’ont pas pu être chargés."); setLoaded(true); return; }
    const payload = await response.json();
    if (!response.ok) setError(payload.error); else setEmails(payload.emails);
    setLoaded(true);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function action(body: Record<string, string>) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setNotice(payload.message); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Cette action n’a pas abouti."); }
    finally { setBusy(false); }
  }
  function correct(event: FormEvent) { event.preventDefault(); void action({ action: "correct", id: orderId, email, reference }); }
  return <div className="page-wrap"><div className="dashboard-header"><div><p className="page-eyebrow">Administration Sellow</p><h1>Reçus et récupération des achats</h1><p>Suivez les envois et corrigez une adresse uniquement après avoir contrôlé la transaction.</p></div><Link className="text-link" href="/studio/retraits">Retraits</Link></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {!loaded ? <div className="loading-card" /> : <>
      {emails.length ? <div className="library-list">{emails.map((row) => <article className="library-row email-admin-row" key={row.id}><div><h2>{row.orders?.product_title ?? "Commande"}</h2><p>{row.recipient}</p><p>{({ pending: "À envoyer", processing: "Envoi en cours", sent: "Envoyé", failed: "Échec de l’envoi" } as Record<string, string>)[row.status]} · {row.attempts} tentative(s)</p>{row.last_error && <p>{row.last_error}</p>}<small>Commande {row.order_id}</small></div>{row.status === "failed" && <button className="button button-light button-small" type="button" disabled={busy} onClick={() => void action({ action: "retry", id: row.id })}>Relancer le reçu</button>}{row.orders?.purchase_identity === "guest" && !row.orders.buyer_id && !row.orders.guest_claimed_at && row.orders.status === "paid" && <button className="text-link" type="button" onClick={() => { setOrderId(row.order_id); setEmail(row.recipient); setReference(""); }}>Préparer une correction</button>}</article>)}</div> : <div className="empty-state"><h2>Aucun reçu enregistré</h2><p>Les prochaines commandes payées apparaîtront ici.</p></div>}
      <section className="content-panel"><h2>Corriger une adresse d’achat invité</h2><p>Contrôlez la preuve de paiement et la référence dans le tableau de bord des paiements avant de valider. Une commande déjà rattachée à un compte ne peut pas être réattribuée.</p><form className="form-stack" onSubmit={correct}><div className="field-group"><label htmlFor="correction-order">Identifiant de commande</label><input className="field-input" id="correction-order" required value={orderId} onChange={(event) => setOrderId(event.target.value)} /></div><div className="field-group"><label htmlFor="correction-email">Adresse e-mail corrigée</label><input className="field-input" id="correction-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="field-group"><label htmlFor="correction-reference">Référence de la transaction contrôlée</label><input className="field-input" id="correction-reference" required value={reference} onChange={(event) => setReference(event.target.value)} /></div><label className="checkbox-line"><input type="checkbox" required /><span>J’ai contrôlé la transaction et la demande de correction du client.</span></label><button className="button button-dark" disabled={busy}>Corriger et renvoyer le reçu</button></form></section>
    </>}
  </div>;
}
