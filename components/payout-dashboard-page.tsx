"use client";

import { publicErrorMessage } from "@/lib/copy.mjs";
import Link from "next/link";
import { commissionCopy, paymentCopy } from "@/lib/copy.mjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bank, CheckCircle, Clock, CurrencyDollar, ShieldCheck, XCircle } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { currencyFractionDigits } from "@/lib/payment/accounting.mjs";

type Balance = { currency: string; gross: number; commission: number; processorFees: number; net: number; reserved: number; available: number };
type PayoutRequest = {
  id: string;
  amount: number;
  currency: string;
  countryCode: string;
  network: string;
  accountName: string;
  phoneNumber: string;
  status: "requested" | "approved" | "rejected" | "paid";
  paymentReference?: string;
  adminNote?: string;
  creatorName?: string;
  creatorSlug?: string;
  createdAt: string;
};

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount); }
  catch { return `${amount.toLocaleString("fr-FR")} ${currency}`; }
}

function statusLabel(status: PayoutRequest["status"]) {
  return ({ requested: "À examiner", approved: "À verser", rejected: "Refusée", paid: "Versée" })[status];
}

export function PayoutDashboardPage() {
  const { user, ready } = useMarketplace();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<PayoutRequest[] | null>(null);
  const [lifetimeSalesUsd, setLifetimeSalesUsd] = useState(0);
  const [commissionRate, setCommissionRate] = useState(0.1);
  const [currency, setCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [network, setNetwork] = useState("");
  const [accountName, setAccountName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || user.isDemo) return;
    setLoadError(null);
    const [earningsResponse, requestsResponse, adminResponse] = await Promise.all([
      fetch("/api/creator/earnings", { cache: "no-store" }).catch(() => null),
      fetch("/api/payout-requests", { cache: "no-store" }).catch(() => null),
      fetch("/api/admin/payout-requests", { cache: "no-store" }).catch(() => null),
    ]);
    if (!earningsResponse?.ok || !requestsResponse?.ok) {
      setLoadError("Vos revenus et demandes de retrait n’ont pas pu être chargés. Réessayez plus tard.");
      return;
    }
    const earnings = await earningsResponse.json() as { balances: Balance[]; lifetimeSalesUsd: number; commissionRate: number };
    const ownRequests = await requestsResponse.json() as { requests: PayoutRequest[] };
    setBalances(earnings.balances);
    setLifetimeSalesUsd(earnings.lifetimeSalesUsd);
    setCommissionRate(earnings.commissionRate);
    setRequests(ownRequests.requests);
    setCurrency((current) => current || earnings.balances.find((balance) => balance.available > 0)?.currency || earnings.balances[0]?.currency || "");
    if (adminResponse?.ok) {
      const adminData = await adminResponse.json() as { requests: PayoutRequest[] };
      setAdminRequests(adminData.requests);
    } else {
      setAdminRequests(null);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedBalance = useMemo(() => balances.find((balance) => balance.currency === currency), [balances, currency]);

  async function requestPayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/payout-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), currency, countryCode, network, accountName, phoneNumber }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "La demande n’a pas été enregistrée.");
      setAmount(""); setCountryCode(""); setNetwork(""); setAccountName(""); setPhoneNumber("");
      setNotice("Votre demande a été enregistrée. Le montant est réservé pendant son traitement.");
      await load();
    } catch (submitError) {
      setError(publicErrorMessage(submitError, "La demande n’a pas été enregistrée."));
    } finally { setBusy(false); }
  }

  async function updateRequest(id: string, status: PayoutRequest["status"]) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/admin/payout-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentReference: paymentReferences[id] ?? "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "La demande n’a pas pu être mise à jour.");
      setNotice("Le statut de la demande a été enregistré.");
      await load();
    } catch (updateError) {
      setError(publicErrorMessage(updateError, "La demande n’a pas pu être mise à jour."));
    } finally { setBusy(false); }
  }

  if (!ready || !user) return <div className="page-wrap"><div className="loading-card" /></div>;

  return (
    <div className="page-wrap payout-page">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/studio"><ArrowLeft size={14} /> Espace créateur</Link><span>›</span><span>Revenus et retraits</span></nav>
      <header className="dashboard-header"><div><p className="page-eyebrow">Vos revenus sur Sellow</p><h1>Revenus et retraits</h1><p>Suivez vos ventes confirmées et demandez un versement mobile money.</p></div><Link className="button button-light button-small" href="/studio">Mes produits <ArrowRight size={15} /></Link></header>

      {user.isDemo && <div className="empty-state payout-empty"><CurrencyDollar size={28} /><h2>Les revenus réels apparaîtront ici</h2><p>Les commandes simulées ne génèrent aucun revenu. Les retraits concernent uniquement les ventes réelles confirmées.</p></div>}
      {loadError && !user.isDemo && <p className="form-error" role="alert">{loadError}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      {!user.isDemo && !loadError && <>
        <section className="payout-tier" aria-label="Votre commission Sellow">
          <div><p className="page-eyebrow">Commission active</p><strong>{Math.round(commissionRate * 100)} %</strong><p>{money(lifetimeSalesUsd, "USD")} de ventes confirmées sur 5 000 $</p></div>
          <div className="payout-tier-progress"><span style={{ width: `${Math.min(100, lifetimeSalesUsd / 5000 * 100)}%` }} /></div>
          <p>{commissionRate <= 0.05 ? "Vous bénéficiez du taux de commission de 5 % sur vos nouveaux paiements." : "La commission passera à 5 % sur les nouveaux paiements après 5 000 $ de ventes brutes confirmées cumulées."}</p><p>{commissionCopy}</p>
        </section>

        <section className="payout-section"><div className="section-heading"><div><p className="page-eyebrow">Ventes confirmées</p><h2>Votre solde</h2></div></div>
          {balances.length ? <div className="payout-balance-grid">{balances.map((balance) => <article className="payout-balance-card" key={balance.currency}>
            <div className="payout-balance-head"><span>{balance.currency}</span><strong>{money(balance.available, balance.currency)}</strong></div>
            <p>Disponible pour retrait</p>
            <dl><div><dt>Ventes brutes</dt><dd>{money(balance.gross, balance.currency)}</dd></div><div><dt>Commission Sellow</dt><dd>{money(balance.commission, balance.currency)}</dd></div><div><dt>{paymentCopy.fees}</dt><dd>{money(balance.processorFees, balance.currency)}</dd></div><div><dt>Déjà réservé ou versé</dt><dd>{money(balance.reserved, balance.currency)}</dd></div></dl>
          </article>)}</div> : <div className="empty-state payout-empty"><h3>Aucune vente réelle confirmée</h3><p>Une commande en attente n’est pas incluse dans le solde.</p></div>}
        </section>

        <section className="payout-section payout-form-section"><div><p className="page-eyebrow">Versement manuel</p><h2>Demander un retrait</h2><p>Le montant demandé est réservé pendant l’examen de votre demande. Après approbation, le versement est effectué manuellement sur le compte mobile money indiqué.</p></div>
          <form className="form-stack payout-form" onSubmit={(event) => void requestPayout(event)}>
            <div className="field-group"><label htmlFor="payout-currency">Devise à retirer</label><select className="field-input" id="payout-currency" required value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="" disabled>Choisissez une devise</option>{balances.map((balance) => <option key={balance.currency} value={balance.currency}>{balance.currency} · disponible {money(balance.available, balance.currency)}</option>)}</select></div>
            <div className="field-group"><label htmlFor="payout-amount">Montant</label><input className="field-input" id="payout-amount" type="number" min="0" step={currency ? 1 / 10 ** Math.min(2, currencyFractionDigits(currency)) : "0.01"} required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={currency ? `Maximum ${selectedBalance?.available ?? 0}` : "Choisissez une devise"} /></div>
            <div className="payout-form-grid"><div className="field-group"><label htmlFor="payout-country">Pays, code ISO</label><input className="field-input" id="payout-country" required minLength={2} maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} placeholder="SN" /></div><div className="field-group"><label htmlFor="payout-network">Réseau mobile money</label><input className="field-input" id="payout-network" required maxLength={60} value={network} onChange={(event) => setNetwork(event.target.value)} placeholder="Orange Money" /></div></div>
            <div className="field-group"><label htmlFor="payout-account-name">Nom du titulaire</label><input className="field-input" id="payout-account-name" required maxLength={120} value={accountName} onChange={(event) => setAccountName(event.target.value)} /></div>
            <div className="field-group"><label htmlFor="payout-phone">Téléphone mobile money</label><input className="field-input" id="payout-phone" type="tel" autoComplete="tel" required maxLength={40} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+221 77 000 00 00" /></div>
            <button className="button button-dark" type="submit" disabled={busy || !balances.length}><Bank size={17} />{busy ? "Enregistrement…" : "Demander le retrait"}</button>
          </form>
        </section>

        <section className="payout-section"><div className="section-heading"><div><p className="page-eyebrow">Votre historique</p><h2>Demandes de retrait</h2></div></div>
          {requests.length ? <div className="payout-request-list">{requests.map((item) => <article className="payout-request-row" key={item.id}><div><strong>{money(item.amount, item.currency)}</strong><span>{item.network} · {item.countryCode} · {item.phoneNumber}</span><small>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(item.createdAt))}</small></div><span className={`status-pill payout-status status-${item.status}`}>{item.status === "paid" ? <CheckCircle size={14} /> : item.status === "rejected" ? <XCircle size={14} /> : <Clock size={14} />}{statusLabel(item.status)}</span>{item.paymentReference && <small>Référence : {item.paymentReference}</small>}{item.adminNote && <small>{item.adminNote}</small>}</article>)}</div> : <div className="empty-state payout-empty"><h3>Aucune demande pour le moment</h3><p>Vos demandes et leur statut apparaîtront ici.</p></div>}
        </section>

        {adminRequests && <Link className="text-link" href="/studio/administration/emails">Reçus et récupération des achats</Link>}
      {adminRequests && <section className="payout-section admin-payout-section"><div className="section-heading"><div><p className="page-eyebrow"><ShieldCheck size={14} /> Gestion Sellow</p><h2>Demandes à traiter</h2></div></div>
          {adminRequests.length ? <div className="payout-request-list">{adminRequests.map((item) => <article className="payout-request-row admin-payout-row" key={item.id}><div><strong>{item.creatorName} · {money(item.amount, item.currency)}</strong>{item.creatorSlug && <Link href={`/createurs/${encodeURIComponent(item.creatorSlug)}`}>Voir la boutique</Link>}<span>{item.accountName} · {item.network} · {item.countryCode} · {item.phoneNumber}</span><small>{statusLabel(item.status)} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(item.createdAt))}</small></div>
            {item.status !== "paid" && item.status !== "rejected" && <div className="admin-payout-actions">{item.status === "requested" && <><button className="button button-light button-small" type="button" disabled={busy} onClick={() => void updateRequest(item.id, "approved")}>Approuver</button><button className="button button-light button-small" type="button" disabled={busy} onClick={() => void updateRequest(item.id, "rejected")}>Refuser</button></>}{item.status === "approved" && <><label className="visually-hidden" htmlFor={`reference-${item.id}`}>{paymentCopy.reference}</label><input className="field-input" id={`reference-${item.id}`} value={paymentReferences[item.id] ?? ""} onChange={(event) => setPaymentReferences((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Référence du versement" /><button className="button button-dark button-small" type="button" disabled={busy || (paymentReferences[item.id] ?? "").trim().length < 2} onClick={() => void updateRequest(item.id, "paid")}>Marquer versée</button><button className="button button-light button-small" type="button" disabled={busy} onClick={() => void updateRequest(item.id, "rejected")}>Refuser</button></>}</div>}</article>)}</div> : <div className="empty-state payout-empty"><h3>Aucune demande à traiter</h3><p>Les demandes des créateurs apparaîtront ici.</p></div>}
        </section>}
      </>}
    </div>
  );
}
