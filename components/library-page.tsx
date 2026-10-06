"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, BookOpenText, Package, PlayCircle } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
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
    if (remoteAccount || !queryEmail) return accountOrders;
    return accountOrders.filter((order) => order.buyerEmail === queryEmail);
  }, [orders, queryEmail, remoteAccount, user?.id]);

  async function download(orderId: string, fileName?: string) {
    const order = visibleOrders.find((item) => item.id === orderId);
    const product = order && products.find((item) => item.id === order.productId);
    if (!order) return;
    if (order.isRemote && product?.filePath) {
      const anchor = document.createElement("a");
      anchor.href = `/api/files/${encodeURIComponent(order.id)}`;
      anchor.click();
      return;
    }
    const body = [
      "Gumroad · fichier de démonstration",
      "",
      `Produit : ${order.productTitle}`,
      `Créateur : ${order.creatorName}`,
      "",
      "Ce fichier confirme le fonctionnement du parcours de démonstration.",
      "Aucun achat ni paiement réel n’a été effectué.",
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName || `${order.productSlug || "produit"}-demonstration.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  return (
    <div className="page-wrap">
      <div className="dashboard-header"><div><p className="page-eyebrow">Vos découvertes</p><h1>Ma bibliothèque</h1><p>Retrouvez ici les produits achetés sur cet appareil.</p></div><Link className="button button-light button-small" href="/#decouvrir">Découvrir des produits <ArrowRight size={15} /></Link></div>
      {remoteAccount ? <div className="library-email"><strong>Bibliothèque du compte</strong><span>Vos commandes Supabase sont rechargées depuis votre compte connecté.</span></div> : <div className="library-email"><label htmlFor="library-email">Adresse e mail de vos achats</label><input className="field-input" id="library-email" type="email" value={queryEmail} onChange={(event) => setQueryEmail(event.target.value.toLowerCase())} placeholder="vous@exemple.com" /><span>Les commandes de démonstration restent dans le navigateur utilisé.</span></div>}
      {visibleOrders.length ? <div className="library-list">{visibleOrders.map((order) => {
        const product = products.find((item) => item.id === order.productId);
        return (
          <article className="library-row" key={order.id}>
            {product ? <ProductCover product={product} compact /> : <div className="library-placeholder"><Package size={24} /></div>}
            <div><p className="page-eyebrow">{order.productKind === "physical" ? "Objet physique" : order.productKind === "service" ? "Service" : order.productKind === "course" ? "Cours" : order.productKind === "membership" ? "Abonnement" : "Fichier numérique"}</p><h2>{order.productTitle}</h2><p>Par {order.creatorName} · Commande simulée</p></div>
            {order.productKind === "download" ? <button className="button button-dark button-small" type="button" onClick={() => void download(order.id, product?.fileName)}><ArrowDown size={15} /> Télécharger</button> : order.productKind === "course" ? <Link className="button button-dark button-small" href={`/apprendre/${encodeURIComponent(order.productSlug)}`}><PlayCircle size={15} /> Apprendre</Link> : <Link className="button button-dark button-small" href={`/contenu/${encodeURIComponent(order.id)}`}>{order.productKind === "physical" ? <Package size={15} /> : <BookOpenText size={15} />} {order.productKind === "membership" ? "Espace membre" : "Voir le reçu"}</Link>}
          </article>
        );
      })}</div> : <div className="empty-state library-empty"><BookOpenText size={30} /><h2>Votre bibliothèque est encore vide</h2><p>Une création vous plaît ? Le checkout de démonstration l’ajoutera ici.</p><Link className="button button-dark" href="/#decouvrir">Explorer la sélection <ArrowRight size={16} /></Link></div>}
    </div>
  );
}
