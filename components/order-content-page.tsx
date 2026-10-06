"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpenText, CheckCircle, Package, PlayCircle } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCover } from "@/components/product-cover";
import type { LessonResource, ProductContent } from "@/lib/types";
import { readLocalFile } from "@/lib/content-storage";
import { VideoPlayer } from "@/components/video-player";

export function OrderContentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { orders, products, cancelSubscription, ready, user, loadProductContent, supabaseConfigured } = useMarketplace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const order = orders.find((item) => item.id === orderId);
  const product = order && products.find((item) => item.id === order.productId);
  const [memberContent, setMemberContent] = useState<ProductContent | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const isBuyer = Boolean(order && (order.isRemote ? order.buyerId === user?.id : !user || order.buyerEmail === user.email.toLowerCase()));

  useEffect(() => {
    if (!order || !product || order.productKind !== "membership" || order.status !== "paid_demo") return;
    let cancelled = false;
    void loadProductContent(product).then((content) => {
      if (!cancelled) setMemberContent(content);
    }).catch((loadError) => {
      if (!cancelled) setContentError(loadError instanceof Error ? loadError.message : "Le contenu membre n’a pas pu être chargé.");
    });
    return () => { cancelled = true; };
  }, [loadProductContent, order, product]);

  async function cancel() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try { await cancelSubscription(order); }
    catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : "L’annulation n’a pas abouti."); }
    finally { setBusy(false); }
  }

  async function downloadResource(resource: LessonResource) {
    if (!product) return;
    if (supabaseConfigured && resource.storagePath && /^[0-9a-f-]{36}$/i.test(product.id)) {
      const anchor = document.createElement("a");
      anchor.href = `/api/resources/${encodeURIComponent(product.id)}/${encodeURIComponent(resource.id)}`;
      anchor.click();
      return;
    }
    const file = await readLocalFile(resource.id);
    if (!file) { setContentError("Cette ressource locale n’est plus disponible sur cet appareil."); return; }
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(file);
    anchor.download = resource.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  if (!order || !isBuyer) return <div className="page-wrap"><div className="empty-state"><h2>Commande introuvable sur cet appareil</h2><p>Ouvrez la bibliothèque du compte qui a réalisé l’achat.</p><Link className="button button-dark" href="/bibliotheque">Ma bibliothèque <ArrowLeft size={16} /></Link></div></div>;

  return (
    <div className="page-wrap content-page-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/bibliotheque"><ArrowLeft size={14} /> Ma bibliothèque</Link><span>›</span><span>Contenu</span></nav>
      <div className="content-product-head">
        {product && <ProductCover product={product} compact />}
        <div><p className="page-eyebrow">{order.status === "canceled_demo" ? "Abonnement annulé" : "Achat simulé · Aucun paiement réel"}</p><h1>{order.productTitle}</h1><p>Par <Link href={order.creatorSlug ? `/createurs/${order.creatorSlug}` : "/"}>{order.creatorName}</Link></p></div>
        {order.status === "paid_demo" && <span className="content-confirmed"><CheckCircle size={17} weight="fill" /> Accès actif</span>}
      </div>
      {order.productKind === "course" && <section className="content-panel"><p className="page-eyebrow">Votre cours</p><h2>Leçons à suivre à votre rythme</h2><p className="content-copy">Votre progression sera enregistrée le temps de votre apprentissage.</p><Link className="button button-dark" href={`/apprendre/${encodeURIComponent(order.productSlug)}`}>Ouvrir le cours <PlayCircle size={17} /></Link></section>}
      {order.productKind === "membership" && <section className="content-panel"><p className="page-eyebrow">Votre espace membre</p><h2>{order.status === "canceled_demo" ? "Abonnement terminé" : "Bienvenue dans l’espace membre"}</h2>{order.status === "paid_demo" ? <><p className="content-copy">Votre abonnement de démonstration donne accès aux publications et aux cours inclus. Aucun renouvellement réel ne sera déclenché.</p>{contentError && <p className="form-error" role="alert">{contentError}</p>}{memberContent ? <>{memberContent.membershipPosts.filter((post) => post.status === "published").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).length ? <div className="member-posts">{memberContent.membershipPosts.filter((post) => post.status === "published").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((post) => <article key={post.id}><span>{post.createdAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(post.createdAt)) : "Publication membre"}</span><h3>{post.title}</h3><p>{post.body}</p>{post.videoUrl && <VideoPlayer url={post.videoUrl} title={post.title} />}{post.resources?.map((resource) => <button className="text-link member-resource" key={resource.id} type="button" onClick={() => void downloadResource(resource)}>{resource.name}</button>)}</article>)}</div> : <div className="content-empty"><h3>Aucune publication pour le moment</h3><p>Les prochaines publications du créateur apparaîtront ici.</p></div>}{memberContent.membershipCourseIds.length > 0 && <div className="included-course-list"><h3>Cours inclus</h3>{memberContent.membershipCourseIds.map((courseId) => products.find((item) => item.id === courseId)).filter((course) => course?.kind === "course").map((course) => <Link className="included-course-link" key={course!.id} href={`/apprendre/${encodeURIComponent(course!.slug)}`}><PlayCircle size={17} /><span>{course!.title}</span></Link>)}</div>}</> : <div className="loading-card" />}<button className="button button-light cancel-membership" type="button" disabled={busy} onClick={() => void cancel()}>{busy ? "Annulation…" : "Annuler l’abonnement simulé"}</button></> : <p className="form-success">L’accès aux publications est fermé. Aucun prélèvement n’a eu lieu.</p>}{error && <p className="form-error" role="alert">{error}</p>}</section>}
      {order.productKind === "physical" && <section className="content-panel"><p className="page-eyebrow">Reçu de commande</p><h2>Votre objet est commandé</h2><p className="content-copy">Dans cette démonstration, l’expédition est gérée manuellement par le créateur.</p><div className="receipt-detail"><Package size={20} /><div><strong>Adresse de livraison</strong><p>{order.shippingAddress || "Aucune adresse enregistrée"}</p></div></div><div className="receipt-detail"><CheckCircle size={20} /><div><strong>Prochaine étape</strong><p>Le créateur prépare l’envoi. Aucun colis ne sera expédié depuis cette démonstration.</p></div></div></section>}
      {order.productKind === "service" && <section className="content-panel"><p className="page-eyebrow">Votre demande</p><h2>Le créateur organisera la suite</h2><p className="content-copy">Les services sont planifiés directement avec la personne qui les propose.</p><div className="receipt-detail"><BookOpenText size={20} /><div><strong>Votre message</strong><p>{order.buyerNote || "Aucun message ajouté."}</p></div></div><div className="demo-note"><CheckCircle size={17} /><span>En mode démonstration, aucune notification n’est envoyée au créateur.</span></div></section>}
      {order.productKind === "download" && <section className="content-panel"><p className="page-eyebrow">Fichier numérique</p><h2>Votre ressource est prête</h2><p className="content-copy">Vous pouvez télécharger un reçu de démonstration depuis votre bibliothèque.</p><Link className="button button-dark" href="/bibliotheque">Ouvrir ma bibliothèque</Link></section>}
      <p className="content-disclaimer">Commande {order.id.slice(0, 14)} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(order.createdAt))}</p>
    </div>
  );
}
