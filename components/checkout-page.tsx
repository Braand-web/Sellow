"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCover } from "@/components/product-cover";
import { formatPrice } from "@/components/product-card";

export function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { products, user, orders, purchase, ready, supabaseConfigured } = useMarketplace();
  const [email, setEmail] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [remoteOrder, setRemoteOrder] = useState<import("@/lib/types").Order | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const product = products.find((item) => item.slug === slug);
  const completedOrder = remoteOrder ?? orders.find((order) => order.id === completedOrderId);
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  const remoteProduct = Boolean(product?.isRemote);
  const requiresAccount = Boolean((supabaseConfigured || liveMode) && remoteProduct);
  const unavailableLiveProduct = Boolean(liveMode && product && !remoteProduct);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.email) setEmail(user.email);
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
    setCompletedOrderId(orderId);
    let cancelled = false;
    void (async () => {
      setCheckingPayment(true);
      for (let attempt = 0; attempt < 7 && !cancelled; attempt += 1) {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" }).catch(() => null);
        if (response?.ok) {
          const payload = await response.json().catch(() => null) as { order?: import("@/lib/types").Order } | null;
          if (payload?.order) setRemoteOrder(payload.order);
          if (payload?.order && payload.order.status !== "pending") break;
          if (attempt < 6) {
            await fetch(`/api/orders/${encodeURIComponent(orderId)}/verify`, { method: "POST" }).catch(() => null);
            await new Promise((resolve) => window.setTimeout(resolve, 1800));
          }
        } else {
          break;
        }
      }
      if (!cancelled) {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" }).catch(() => null);
        if (response?.ok) {
          const payload = await response.json().catch(() => null) as { order?: import("@/lib/types").Order } | null;
          if (payload?.order) setRemoteOrder(payload.order);
        }
        setCheckingPayment(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  const verifyPayment = useCallback(async () => {
    if (!completedOrder?.isRemote) return;
    setCheckingPayment(true);
    try {
      const verifyResponse = await fetch(`/api/orders/${encodeURIComponent(completedOrder.id)}/verify`, { method: "POST" });
      const verification = await verifyResponse.json().catch(() => null) as { error?: string } | null;
      if (!verifyResponse.ok) throw new Error(verification?.error ?? "L’état du paiement n’a pas pu être vérifié.");
      const response = await fetch(`/api/orders/${encodeURIComponent(completedOrder.id)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { order?: import("@/lib/types").Order; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "La commande n’a pas pu être rechargée.");
      if (response.ok && payload?.order) setRemoteOrder(payload.order);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "L’état du paiement n’a pas pu être vérifié.");
    } finally {
      setCheckingPayment(false);
    }
  }, [completedOrder]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const order = await purchase({ product, buyerEmail: email, shippingAddress, buyerNote });
      if (order.checkoutUrl) {
        window.location.assign(order.checkoutUrl);
        return;
      }
      setCompletedOrderId(order.id);
      router.replace(`/checkout/${product.slug}?order=${encodeURIComponent(order.id)}`, { scroll: false });
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : "Le checkout n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="checkout-shell"><div className="loading-card" /></div>;
  if (!product || !product.published) return <section className="not-found"><div><p className="page-eyebrow">Checkout indisponible</p><h1>Ce produit n’est plus disponible.</h1><Link className="button button-dark" href="/">Retour à la découverte <ArrowRight size={16} /></Link></div></section>;

  if (unavailableLiveProduct) return <section className="not-found"><div><p className="page-eyebrow">Paiement indisponible</p><h1>Ce produit n’est pas encore configuré pour le paiement réel.</h1><Link className="button button-dark" href={`/produits/${product.slug}`}>Retour au produit <ArrowRight size={16} /></Link></div></section>;

  if (completedOrder && !["paid", "paid_demo"].includes(completedOrder.status)) {
    return <div className="checkout-status"><span className="checkout-status-icon"><ShieldCheck size={25} /></span><p className="page-eyebrow">{completedOrder.status === "failed" || completedOrder.status === "canceled" ? "Paiement non confirmé" : "Confirmation en cours"}</p><h1>{completedOrder.status === "failed" || completedOrder.status === "canceled" ? "Le paiement n’a pas été confirmé." : "Nous vérifions votre paiement."}</h1><p>{completedOrder.status === "pending" ? "Votre accès sera ouvert dès que SasPay aura confirmé la transaction." : "Vous pouvez relancer le paiement depuis la page SasPay ou réessayer."}</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" type="button" disabled={checkingPayment} onClick={() => void verifyPayment()}>{checkingPayment ? "Vérification…" : "Vérifier à nouveau"}<ArrowRight size={17} /></button><Link className="text-link" href="/bibliotheque">Ouvrir ma bibliothèque</Link></div>;
  }

  if (completedOrder) {
    const demoOrder = completedOrder.status === "paid_demo";
    return (
      <div className="checkout-status">
        <span className="checkout-status-icon"><Check size={25} weight="bold" /></span>
        <p className="page-eyebrow">{demoOrder ? "Commande de démonstration confirmée" : "Paiement confirmé par SasPay"}</p>
        <h1>Votre création est prête.</h1>
        <p>{demoOrder ? <>Un achat simulé pour <strong>{completedOrder.buyerEmail}</strong>. Aucun paiement réel n’a été effectué.</> : <>Le paiement de <strong>{formatPrice(completedOrder.amount, completedOrder.currency)}</strong> est confirmé. Votre accès est ouvert.</>}</p>
        {product.kind === "membership" && completedOrder.membershipExpiresAt && <p className="order-followup">Votre accès est valable jusqu’au {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(completedOrder.membershipExpiresAt))}. Le renouvellement est manuel.</p>}
        {product.kind === "physical" && <p className="order-followup">Le créateur organisera l’envoi à l’adresse indiquée.</p>}
        {product.kind === "service" && <p className="order-followup">Le créateur vous répondra au sujet de votre demande.</p>}
        <Link className="button button-dark" href={completedOrder.isRemote ? "/bibliotheque" : `/bibliotheque?email=${encodeURIComponent(completedOrder.buyerEmail)}`}>Ouvrir ma bibliothèque <ArrowRight size={17} /></Link>
        {demoOrder && <div className="demo-note"><ShieldCheck size={17} /><span>Ce site est une démonstration. Aucun débit, abonnement ou versement n’a lieu.</span></div>}
      </div>
    );
  }

  return (
    <div className="checkout-shell">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href={`/produits/${product.slug}`}><ArrowLeft size={14} /> Retour au produit</Link><span>›</span><span>Checkout</span></nav>
      <div className="checkout-grid">
        <section className="checkout-main">
          <p className="page-eyebrow">{liveMode ? "Paiement sécurisé" : "Commande de démonstration"}</p>
          <h1>{liveMode ? "Finalisez votre achat." : "Un petit pas pour votre prochain projet."}</h1>
          <p>{liveMode ? "SasPay vous redirigera vers une page sécurisée pour choisir votre moyen de paiement." : "Renseignez vos coordonnées pour simuler l’achat. Aucun paiement réel ne sera demandé."}</p>
          {requiresAccount && (!user || user.isDemo) ? <div className="account-required" role="status"><h2>Connectez-vous pour continuer</h2><p>Les commandes liées à Supabase sont rattachées à votre compte afin de retrouver vos achats sur vos appareils.</p><Link className="button button-dark" href={`/connexion?next=${encodeURIComponent(`/checkout/${product.slug}`)}`}>Se connecter <ArrowRight size={17} /></Link></div> : <form className="form-stack" onSubmit={submit}>
            <div className="field-group"><label htmlFor="buyer-email">Adresse e mail</label><input className="field-input" id="buyer-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" /></div>
            {product.kind === "physical" && <div className="field-group"><label htmlFor="shipping-address">Adresse de livraison</label><textarea className="field-textarea" id="shipping-address" required value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} placeholder="Nom, rue, ville et pays" /></div>}
            {product.kind === "service" && <div className="field-group"><label htmlFor="buyer-note">Quelques mots pour le créateur</label><textarea className="field-textarea" id="buyer-note" value={buyerNote} onChange={(event) => setBuyerNote(event.target.value)} placeholder="Parlez de votre besoin ou de votre projet" /></div>}
            {product.kind === "membership" && liveMode && <p className="field-help">L’accès est payé mois par mois. Aucun prélèvement automatique n’est effectué; vous renouvellerez manuellement.</p>}
            <label className="checkbox-line"><input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>{liveMode ? "Je confirme une commande réelle et serai redirigé vers SasPay pour le paiement." : "Je comprends qu’il s’agit d’un achat simulé sans paiement réel."}</span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark" type="submit" disabled={busy || !accepted}>{busy ? (liveMode ? "Préparation du paiement…" : "Préparation de la démonstration…") : liveMode ? (product.kind === "membership" ? "Payer l’accès du mois" : "Continuer vers SasPay") : product.kind === "membership" ? "Activer l’abonnement simulé" : "Confirmer l’achat simulé"}<ArrowRight size={17} /></button>
            <p className="field-help checkout-privacy">{requiresAccount ? "La commande sera associée à votre compte." : "Votre adresse e mail sert à retrouver cette démonstration sur cet appareil."}</p>
          </form>}
        </section>
        <aside className="checkout-summary">
          <ProductCover product={product} />
          <p className="page-eyebrow">{product.category}</p>
          <h2>{product.title}</h2>
          <p className="checkout-creator">Par <Link href={`/createurs/${product.creatorSlug}`}>{product.creatorName}</Link></p>
          <div className="checkout-total"><span>{liveMode ? "Montant" : "Total simulé"}</span><span>{formatPrice(product.price, product.currency)}{product.kind === "membership" ? " / mois" : ""}</span></div>
          <div className="demo-note"><ShieldCheck size={16} /><span>{liveMode ? "Les données de paiement sont saisies sur le checkout hébergé SasPay." : "Le checkout ne collecte aucune donnée bancaire."}</span></div>
        </aside>
      </div>
    </div>
  );
}
