"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
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
  const product = products.find((item) => item.slug === slug);
  const completedOrder = orders.find((order) => order.id === completedOrderId);
  const requiresAccount = Boolean(supabaseConfigured && product && /^[0-9a-f-]{36}$/i.test(product.id));

  useEffect(() => {
    // Sync the signed-in buyer and a checkout return URL after the client has hydrated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.email) setEmail(user.email);
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (orderId) setCompletedOrderId(orderId);
  }, [user?.email]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const order = await purchase({ product, buyerEmail: email, shippingAddress, buyerNote });
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

  if (completedOrder) {
    return (
      <div className="checkout-status">
        <span className="checkout-status-icon"><Check size={25} weight="bold" /></span>
        <p className="page-eyebrow">Commande de démonstration confirmée</p>
        <h1>Votre création est prête.</h1>
        <p>Un achat simulé pour <strong>{completedOrder.buyerEmail}</strong>. Aucun paiement réel n’a été effectué.</p>
        {product.kind === "physical" && <p className="order-followup">Le créateur organisera l’envoi à l’adresse indiquée.</p>}
        {product.kind === "service" && <p className="order-followup">Le créateur vous répondra au sujet de votre demande.</p>}
        <Link className="button button-dark" href={completedOrder.isRemote ? "/bibliotheque" : `/bibliotheque?email=${encodeURIComponent(completedOrder.buyerEmail)}`}>Ouvrir ma bibliothèque <ArrowRight size={17} /></Link>
        <div className="demo-note"><ShieldCheck size={17} /><span>Ce site est une démonstration. Aucun débit, abonnement ou versement n’a lieu.</span></div>
      </div>
    );
  }

  return (
    <div className="checkout-shell">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href={`/produits/${product.slug}`}><ArrowLeft size={14} /> Retour au produit</Link><span>›</span><span>Checkout</span></nav>
      <div className="checkout-grid">
        <section className="checkout-main">
          <p className="page-eyebrow">Commande de démonstration</p>
          <h1>Un petit pas pour votre prochain projet.</h1>
          <p>Renseignez vos coordonnées pour simuler l’achat. Aucun paiement réel ne sera demandé.</p>
          {requiresAccount && (!user || user.isDemo) ? <div className="account-required" role="status"><h2>Connectez-vous pour continuer</h2><p>Les commandes liées à Supabase sont rattachées à votre compte afin de retrouver vos achats sur vos appareils.</p><Link className="button button-dark" href={`/connexion?next=${encodeURIComponent(`/checkout/${product.slug}`)}`}>Se connecter <ArrowRight size={17} /></Link></div> : <form className="form-stack" onSubmit={submit}>
            <div className="field-group"><label htmlFor="buyer-email">Adresse e mail</label><input className="field-input" id="buyer-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" /></div>
            {product.kind === "physical" && <div className="field-group"><label htmlFor="shipping-address">Adresse de livraison</label><textarea className="field-textarea" id="shipping-address" required value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} placeholder="Nom, rue, ville et pays" /></div>}
            {product.kind === "service" && <div className="field-group"><label htmlFor="buyer-note">Quelques mots pour le créateur</label><textarea className="field-textarea" id="buyer-note" value={buyerNote} onChange={(event) => setBuyerNote(event.target.value)} placeholder="Parlez de votre besoin ou de votre projet" /></div>}
            <label className="checkbox-line"><input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Je comprends qu’il s’agit d’un achat simulé sans paiement réel.</span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark" type="submit" disabled={busy || !accepted}>{busy ? "Préparation de la démonstration…" : product.kind === "membership" ? "Activer l’abonnement simulé" : "Confirmer l’achat simulé"}<ArrowRight size={17} /></button>
            <p className="field-help checkout-privacy">{requiresAccount ? "La commande sera associée à votre compte." : "Votre adresse e mail sert à retrouver cette démonstration sur cet appareil."}</p>
          </form>}
        </section>
        <aside className="checkout-summary">
          <ProductCover product={product} />
          <p className="page-eyebrow">{product.category}</p>
          <h2>{product.title}</h2>
          <p className="checkout-creator">Par <Link href={`/createurs/${product.creatorSlug}`}>{product.creatorName}</Link></p>
          <div className="checkout-total"><span>Total simulé</span><span>{formatPrice(product.price, product.currency)}{product.kind === "membership" ? " / mois" : ""}</span></div>
          <div className="demo-note"><ShieldCheck size={16} /><span>Le checkout ne collecte aucune donnée bancaire.</span></div>
        </aside>
      </div>
    </div>
  );
}
