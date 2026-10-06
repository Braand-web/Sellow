"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeSlash, PencilSimple, Plus, SignOut, Trash } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCover } from "@/components/product-cover";
import { formatPrice } from "@/components/product-card";
import { kindLabels } from "@/lib/types";

export function DashboardPage() {
  const router = useRouter();
  const { user, products, orders, ready, supabaseConnected, togglePublished, deleteProduct, logout, setMessage } = useMarketplace();
  const [busyId, setBusyId] = useState<string | null>(null);
  const myProducts = products.filter((product) => product.creatorId === user?.id || product.creatorSlug === user?.slug);
  const myOrders = orders.filter((order) => myProducts.some((product) => product.id === order.productId) && ["paid", "paid_demo"].includes(order.status));

  useEffect(() => {
    if (ready && !user) router.replace("/connexion?next=%2Fstudio");
  }, [ready, user, router]);

  async function changeVisibility(id: string) {
    setBusyId(id);
    try { await togglePublished(id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Le produit n’a pas pu être modifié."); }
    finally { setBusyId(null); }
  }

  async function remove(id: string) {
    const product = myProducts.find((item) => item.id === id);
    if (!product || !window.confirm(`Supprimer « ${product.title} » ?`)) return;
    try { await deleteProduct(id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Le produit n’a pas pu être supprimé."); }
  }

  async function signOut() {
    await logout();
    router.push("/");
  }

  if (!ready || !user) return <div className="page-wrap"><div className="loading-card" /></div>;

  return (
    <div className="page-wrap dashboard-wrap">
      <div className="dashboard-header"><div><p className="page-eyebrow">Bonjour {user.name.split(" ")[0]}</p><h1>Votre espace créateur</h1><p>Gérez vos créations et partagez les avec votre communauté.</p></div><div className="dashboard-head-actions"><Link className="button button-dark" href="/studio/nouveau"><Plus size={18} weight="bold" /> Ajouter un produit</Link><button className="icon-button" type="button" onClick={() => void signOut()} aria-label="Se déconnecter"><SignOut size={17} /></button></div></div>
      <nav className="dashboard-tabs" aria-label="Espace créateur"><Link aria-current="page" href="/studio">Produits</Link><Link href={`/createurs/${user.slug}`}>Ma boutique</Link><Link href="/studio/retraits">Revenus et retraits</Link><Link href="/bibliotheque">Ma bibliothèque</Link></nav>
      <div className="dashboard-notice"><span /> {supabaseConnected ? "Supabase connecté. Les produits publiés sont partagés." : user.isDemo ? "Mode démonstration local. Les changements sont enregistrés dans ce navigateur." : "Compte connecté. Vérifiez la configuration de la base Supabase pour publier."}</div>
      <div className="dashboard-stats">
        <div className="stat-card"><span>Produits publiés</span><strong>{myProducts.filter((item) => item.published).length}</strong></div>
        <div className="stat-card"><span>{process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay" ? "Ventes confirmées" : "Commandes terminées"}</span><strong>{myOrders.length}</strong></div>
        <Link className="stat-card stat-card-link" href="/studio/retraits"><span>Revenus et retraits</span><strong>Consulter <ArrowRight size={15} /></strong></Link>
      </div>
      <div className="section-heading"><div><p className="page-eyebrow">Votre catalogue</p><h2>Produits</h2></div>{myProducts.length > 0 && <span className="results-count">{myProducts.length} produit{myProducts.length > 1 ? "s" : ""}</span>}</div>
      {myProducts.length ? <div className="dashboard-list">{myProducts.map((product) => (
        <article className="dashboard-row" key={product.id}>
          <div className="dashboard-product"><ProductCover product={product} compact /><div><h3>{product.title}</h3><p>{kindLabels[product.kind]} · {formatPrice(product.price, product.currency)}</p></div></div>
          <span className={`status-pill${product.published ? " is-live" : ""}`}>{product.published ? "En ligne" : "Brouillon"}</span>
          <div className="row-actions">
            {product.published && <Link className="icon-button" href={`/produits/${product.slug}`} aria-label={`Voir ${product.title}`}><ArrowRight size={16} /></Link>}
            <Link className="icon-button" href={`/studio/produits/${encodeURIComponent(product.id)}/modifier`} aria-label={`Modifier ${product.title}`}><PencilSimple size={16} /></Link>
            <button className="button button-light button-small visibility-toggle" type="button" disabled={busyId === product.id} onClick={() => void changeVisibility(product.id)} aria-label={product.published ? `Dépublier ${product.title}` : `Publier ${product.title}`}>{product.published ? <EyeSlash size={15} /> : <Eye size={15} />}{product.published ? "Dépublier" : "Publier"}</button>
            <button className="icon-button delete-button" type="button" onClick={() => void remove(product.id)} aria-label="Supprimer le produit"><Trash size={16} /></button>
          </div>
        </article>
      ))}</div> : <div className="empty-state"><h2>Votre boutique commence ici</h2><p>Ajoutez une première création pour la rendre visible dans la découverte.</p><Link className="button button-dark" href="/studio/nouveau"><Plus size={17} /> Ajouter un produit</Link></div>}
      <p className="dashboard-help">{process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay" ? "Les ventes SasPay sont comptabilisées après confirmation. Les retraits sont demandés dans Sellow puis versés manuellement depuis SasPay." : "Les commandes simulées ne déclenchent aucun paiement ni revenu. Activez SasPay après avoir configuré les clés et la migration Supabase."}</p>
    </div>
  );
}
