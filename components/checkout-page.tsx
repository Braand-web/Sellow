"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { EmailAccessForm } from "@/components/email-access-form";
import { ProductCover } from "@/components/product-cover";
import { formatPrice } from "@/components/product-card";
import { checkoutConfirmation, membershipCopy, paymentCopy, publicErrorMessage } from "@/lib/copy.mjs";

export function CheckoutPage({ guestCheckoutEnabled = false, emailOtpEnabled = false }: { guestCheckoutEnabled?: boolean; emailOtpEnabled?: boolean } = {}) {
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
  const [orderLookupDone, setOrderLookupDone] = useState(false);
  const checkoutIntent = useRef<{ fingerprint: string; key: string } | null>(null);
  const product = products.find((item) => item.slug === slug);
  const completedOrder = remoteOrder ?? orders.find((order) => order.id === completedOrderId);
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  const remoteProduct = Boolean(product?.isRemote);
  const requiresAccount = Boolean((supabaseConfigured || liveMode) && remoteProduct && !guestCheckoutEnabled);
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
        setOrderLookupDone(true);
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
      setError(publicErrorMessage(verifyError, paymentCopy.verificationUnavailable));
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
      const fingerprint = JSON.stringify([product.id, user?.id ?? null, email.trim().toLowerCase(), shippingAddress.trim(), buyerNote.trim()]);
      if (checkoutIntent.current?.fingerprint !== fingerprint) checkoutIntent.current = { fingerprint, key: crypto.randomUUID() };
      const order = await purchase({ product, buyerEmail: email, shippingAddress, buyerNote, idempotencyKey: checkoutIntent.current.key });
      if (order.checkoutUrl) {
        window.location.assign(order.checkoutUrl);
        return;
      }
      setCompletedOrderId(order.id);
      router.replace(`/checkout/${product.slug}?order=${encodeURIComponent(order.id)}`, { scroll: false });
    } catch (purchaseError) {
      setError(publicErrorMessage(purchaseError, paymentCopy.unavailable));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="checkout-shell"><div className="loading-card" /></div>;
  if (completedOrderId && !completedOrder && !orderLookupDone) return <div className="checkout-shell"><div className="loading-card" /></div>;
  if (completedOrderId && !completedOrder && orderLookupDone) return <section className="not-found"><div><p className="page-eyebrow">Votre achat</p><h1>Retrouvez votre commande</h1><p>Vérifiez votre adresse e-mail pour consulter l’état du paiement et retrouver vos achats.</p><Link className="button button-dark" href={`/achats/retrouver?commande=${encodeURIComponent(completedOrderId)}`}>Retrouver mes achats <ArrowRight size={16} /></Link></div></section>;

  if (completedOrder && !["paid", "paid_demo"].includes(completedOrder.status)) {
    return <div className="checkout-status"><span className="checkout-status-icon"><ShieldCheck size={25} /></span><p className="page-eyebrow">{completedOrder.status === "failed" || completedOrder.status === "canceled" ? "Paiement non confirmé" : "Confirmation en cours"}</p><h1>{completedOrder.status === "failed" || completedOrder.status === "canceled" ? "Le paiement n’a pas été confirmé." : "Nous vérifions votre paiement."}</h1><p>{completedOrder.status === "pending" ? paymentCopy.pending : paymentCopy.unconfirmed}</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" type="button" disabled={checkingPayment} onClick={() => void verifyPayment()}>{checkingPayment ? "Vérification…" : "Vérifier à nouveau"}<ArrowRight size={17} /></button><Link className="text-link" href={`/produits/${completedOrder.productSlug}`}>Retour au produit</Link><Link className="text-link" href="/bibliotheque">Ouvrir ma bibliothèque</Link></div>;
  }

  if (completedOrder) {
    const demoOrder = completedOrder.status === "paid_demo";
    const confirmation = checkoutConfirmation(completedOrder.productKind, demoOrder);
    const needsVerification = Boolean(completedOrder.requiresEmailVerification);
    return (
      <div className="checkout-status">
        <span className="checkout-status-icon"><Check size={25} weight="bold" /></span>
        <p className="page-eyebrow">{demoOrder ? "Commande simulée confirmée" : paymentCopy.confirmed}</p>
        <h1>{needsVerification ? "Vérifiez votre adresse e-mail pour accéder à votre achat" : confirmation.title}</h1>
        <p>{demoOrder ? <>Un achat simulé pour <strong>{completedOrder.buyerEmail}</strong>. Aucun paiement réel n’a été effectué.</> : <>Le paiement de <strong>{formatPrice(completedOrder.amount, completedOrder.currency)}</strong> est confirmé.</>}</p>
        <p>{needsVerification ? <>Votre paiement pour <strong>{completedOrder.productTitle}</strong> est confirmé. Un code vous permettra de retrouver votre achat.</> : confirmation.description}</p>
        {completedOrder.productKind === "membership" && completedOrder.membershipExpiresAt && <p className="order-followup">Votre accès est valable jusqu’au {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(completedOrder.membershipExpiresAt))}. Le renouvellement est manuel.</p>}
        {needsVerification ? <EmailAccessForm initialEmail={completedOrder.buyerEmail} orderId={completedOrder.id} lockEmail enabled={emailOtpEnabled} /> : <>
          {completedOrder.isRemote && <Link className="button button-dark" href={completedOrder.productKind === "download" ? `/api/files/${encodeURIComponent(completedOrder.id)}` : completedOrder.productKind === "course" ? `/apprendre/${encodeURIComponent(completedOrder.productSlug)}` : `/contenu/${encodeURIComponent(completedOrder.id)}`}>{completedOrder.productKind === "download" ? "Télécharger mes fichiers" : completedOrder.productKind === "course" ? "Commencer le cours" : completedOrder.productKind === "membership" ? "Ouvrir mon espace membre" : "Voir ma commande"}<ArrowRight size={17} /></Link>}
          <Link className={completedOrder.isRemote ? "text-link" : "button button-dark"} href={completedOrder.isRemote ? "/bibliotheque" : `/bibliotheque?email=${encodeURIComponent(completedOrder.buyerEmail)}`}>Ouvrir ma bibliothèque <ArrowRight size={17} /></Link>
        </>}
        {demoOrder && <div className="demo-note"><ShieldCheck size={17} /><span>Ce site est une démonstration. Aucun débit, abonnement ou versement n’a lieu.</span></div>}
      </div>
    );
  }

  if (!product || !product.published) return <section className="not-found"><div><p className="page-eyebrow">Produit indisponible</p><h1>Ce produit n’est plus disponible.</h1><Link className="button button-dark" href="/">Explorer les produits <ArrowRight size={16} /></Link></div></section>;

  if (unavailableLiveProduct) return <section className="not-found"><div><p className="page-eyebrow">Produit de démonstration</p><h1>Ce produit est présenté à titre d’exemple.</h1><p>Il ne peut pas faire l’objet d’un achat réel.</p><Link className="button button-dark" href={`/produits/${product.slug}`}>Retour au produit <ArrowRight size={16} /></Link></div></section>;

  return (
    <div className="checkout-shell">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href={`/produits/${product.slug}`}><ArrowLeft size={14} /> Retour au produit</Link><span>›</span><span>Paiement</span></nav>
      <div className="checkout-grid">
        <section className="checkout-main">
          <p className="page-eyebrow">{liveMode ? "Paiement sécurisé" : "Commande de démonstration"}</p>
          <h1>{liveMode ? "Finalisez votre achat" : "Essayez le parcours d’achat"}</h1>
          <p>{liveMode ? paymentCopy.introduction : "Renseignez vos coordonnées pour simuler l’achat. Aucun paiement réel ne sera demandé."}</p>
          {guestCheckoutEnabled && liveMode && (!user || user.isDemo) && <Link className="text-link checkout-signin" href={`/connexion?next=${encodeURIComponent(`/checkout/${slug}`)}`}>Déjà client ? Se connecter</Link>}
          {requiresAccount && (!user || user.isDemo) ? <div className="account-required" role="status"><h2>Connectez-vous pour continuer</h2><p>Votre achat sera associé à votre compte pour retrouver vos commandes et vos contenus sur vos appareils.</p><Link className="button button-dark" href={`/connexion?next=${encodeURIComponent(`/checkout/${product.slug}`)}`}>Se connecter <ArrowRight size={17} /></Link></div> : <form className="form-stack" onSubmit={submit}>
            <div className="field-group"><label htmlFor="buyer-email">Adresse e mail</label><input className="field-input" id="buyer-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" readOnly={Boolean(user && !user.isDemo)} maxLength={254} /><span className="field-help">{user && !user.isDemo ? "Votre commande est associée à ce compte." : guestCheckoutEnabled && liveMode ? "Vérifiez cette adresse avant de payer. Elle vous servira à ouvrir votre achat avec un code, sans mot de passe." : ""}</span></div>
            {product.kind === "physical" && <div className="field-group"><label htmlFor="shipping-address">Adresse de livraison</label><textarea className="field-textarea" id="shipping-address" required value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} placeholder="Nom, rue, ville et pays" /></div>}
            {product.kind === "service" && <div className="field-group"><label htmlFor="buyer-note">Quelques mots pour le créateur</label><textarea className="field-textarea" id="buyer-note" value={buyerNote} onChange={(event) => setBuyerNote(event.target.value)} placeholder="Parlez de votre besoin ou de votre projet" /></div>}
            {product.kind === "membership" && liveMode && <p className="field-help">{membershipCopy.renewal}</p>}
            <label className="checkbox-line"><input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>{liveMode ? "Je confirme cette commande et souhaite continuer vers le paiement." : "Je comprends qu’il s’agit d’un achat simulé sans paiement réel."}</span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark" type="submit" disabled={busy || !accepted}>{busy ? (liveMode ? "Préparation du paiement…" : "Préparation de la démonstration…") : liveMode ? (product.kind === "membership" ? "Payer l’accès du mois" : paymentCopy.continue) : product.kind === "membership" ? "Activer l’abonnement simulé" : "Confirmer l’achat simulé"}<ArrowRight size={17} /></button>
            <p className="field-help checkout-privacy">{liveMode ? user && !user.isDemo ? "La commande sera associée à votre compte." : "Vous pourrez accéder à votre achat après avoir vérifié votre adresse e-mail." : requiresAccount ? "La commande sera associée à votre compte." : "Votre adresse e mail sert à retrouver cette démonstration sur cet appareil."}</p>
          </form>}
        </section>
        <aside className="checkout-summary">
          <ProductCover product={product} />
          <p className="page-eyebrow">{product.category}</p>
          <h2>{product.title}</h2>
          <p className="checkout-creator">Par <Link href={`/createurs/${product.creatorSlug}`}>{product.creatorName}</Link></p>
          <div className="checkout-total"><span>{liveMode ? "Montant" : "Total simulé"}</span><span>{formatPrice(product.price, product.currency)}{product.kind === "membership" ? " / mois" : ""}</span></div>
          <div className="demo-note"><ShieldCheck size={16} /><span>{liveMode ? paymentCopy.privacy : "Cette démonstration ne collecte aucune donnée bancaire."}</span></div>
        </aside>
      </div>
    </div>
  );
}
