"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpenText, Package, PlayCircle } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { LibraryDownloads } from "@/components/library-downloads";
import { ProductCover } from "@/components/product-cover";

export function LibraryPage() {
  const { orders, products, user, ready, supabaseConfigured } = useMarketplace();
  const remoteAccount = Boolean(supabaseConfigured && user && !user.isDemo);
  const [queryEmail, setQueryEmail] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("email");
    // Seed the library filter from the receipt link or the signed-in buyer after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query) setQueryEmail(query.toLowerCase());
    else if (user?.email) setQueryEmail(user.email.toLowerCase());
  }, [user?.email]);

  const visibleOrders = useMemo(() => {
    const accountOrders = remoteAccount
      ? orders.filter((order) => order.isRemote && order.buyerId === user?.id)
      : orders.filter((order) => !order.isRemote);
    const paidOrders = accountOrders.filter((order) => ["paid", "paid_demo"].includes(order.status));
    if (remoteAccount || !queryEmail) return paidOrders;
    return paidOrders.filter((order) => order.buyerEmail === queryEmail);
  }, [orders, queryEmail, remoteAccount, user?.id]);

  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  return (
    <div className="page-wrap">
      <div className="dashboard-header"><div><p className="page-eyebrow">Vos découvertes</p><h1>Ma bibliothèque</h1><p>{remoteAccount ? "Retrouvez les achats et les contenus associés à votre compte." : "Retrouvez vos achats simulés dans le navigateur utilisé pour la démonstration."}</p></div><Link className="button button-light button-small" href="/#decouvrir">Découvrir des produits <ArrowRight size={15} /></Link></div>
      {remoteAccount ? <div className="library-email"><strong>Bibliothèque du compte</strong><span>Utilisez le compte qui a réalisé l’achat pour retrouver vos commandes sur vos appareils.</span></div> : <div className="library-email"><label htmlFor="library-email">Adresse e mail de vos achats</label><input className="field-input" id="library-email" type="email" value={queryEmail} onChange={(event) => setQueryEmail(event.target.value.toLowerCase())} placeholder="vous@exemple.com" /><span>Les commandes de démonstration restent dans le navigateur utilisé.</span></div>}
      {visibleOrders.length ? <div className="library-list">{visibleOrders.map((order) => {
        const product = products.find((item) => item.id === order.productId);
        return (
          <article className="library-row" key={order.id}>
            {product ? <ProductCover product={product} compact /> : <div className="library-placeholder"><Package size={24} /></div>}
            <div><p className="page-eyebrow">{order.productKind === "physical" ? "Objet physique" : order.productKind === "service" ? "Service" : order.productKind === "course" ? "Cours" : order.productKind === "membership" ? "Abonnement" : "Fichier numérique"}</p><h2>{order.productTitle}</h2><p>Par {order.creatorName} · {order.status === "paid_demo" ? "Commande simulée" : "Paiement confirmé"}</p>{order.productKind === "membership" && order.membershipExpiresAt && <p>Accès jusqu’au {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(order.membershipExpiresAt))}</p>}</div>
            {order.productKind === "download" ? <LibraryDownloads order={order} product={product} /> : order.productKind === "course" ? <Link className="button button-dark button-small" href={`/apprendre/${encodeURIComponent(order.productSlug)}`}><PlayCircle size={15} /> Suivre le cours</Link> : <Link className="button button-dark button-small" href={`/contenu/${encodeURIComponent(order.id)}`}>{order.productKind === "physical" ? <Package size={15} /> : <BookOpenText size={15} />} {order.productKind === "membership" ? "Espace membre" : "Voir le reçu"}</Link>}
          </article>
        );
      })}</div> : <div className="empty-state library-empty"><BookOpenText size={30} /><h2>Votre bibliothèque est encore vide</h2><p>{remoteAccount ? "Choisissez un produit dans le catalogue. Votre commande apparaîtra ici après confirmation du paiement." : "Essayez un achat simulé pour découvrir les contenus et les ressources de la bibliothèque."}</p><Link className="button button-dark" href="/#decouvrir">Explorer les produits <ArrowRight size={16} /></Link></div>}
    </div>
  );
}
