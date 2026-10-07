"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, ShieldCheck } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCard, formatPrice } from "@/components/product-card";
import { ProductCover } from "@/components/product-cover";
import { kindLabels } from "@/lib/types";
import type { ProductContent } from "@/lib/types";
import { RichTextContent } from "@/components/rich-text-content";
import { MobilePurchaseBar } from "@/components/mobile-purchase-bar";

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { products, favorites, toggleFavorite, ready, loadProductContent, supabaseConfigured, user } = useMarketplace();
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  const product = products.find((item) => item.slug === slug);
  const liveProduct = Boolean(product?.isRemote);
  const purchaseRef = useRef<HTMLAnchorElement>(null);
  const [publicContent, setPublicContent] = useState<ProductContent | null>(null);
  useEffect(() => {
    if (product?.kind !== "membership") return;
    let cancelled = false;
    void loadProductContent(product).then((content) => { if (!cancelled) setPublicContent(content); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [loadProductContent, product]);

  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  if (!product || !product.published) {
    return <section className="not-found"><div><p className="page-eyebrow">Produit introuvable</p><h1>Ce produit n’est plus disponible.</h1><p>Le créateur a pu retirer cette fiche du catalogue. Explorez les autres produits disponibles.</p><Link className="button button-dark" href="/">Retour à la découverte <ArrowRight size={16} /></Link></div></section>;
  }

  const saved = favorites.includes(product.id);
  const checkoutAvailable = !liveMode || liveProduct;
  const checkoutHref = `/checkout/${product.slug}`;
  const purchaseLabel = product.kind === "membership" ? "Choisir cet abonnement" : product.kind === "service" ? "Commander ce service" : product.price === 0 ? "Obtenir le produit" : "Acheter ce produit";
  const related = products.filter((item) => item.id !== product.id && item.published && item.category === product.category).slice(0, 3);
  const detailText = product.kind === "course"
    ? `${product.details?.courseLessons?.length ?? product.details?.lessons ?? 0} leçons · ${product.details?.duration ?? "À votre rythme"}`
    : product.kind === "membership"
      ? liveMode ? "Accès mensuel · Renouvellement manuel" : "Accès mensuel simulé"
      : product.kind === "physical"
        ? String(product.details?.shipping ?? "Expédition organisée par le créateur")
        : product.kind === "service"
          ? String(product.details?.fulfillment ?? "Une prestation organisée avec le créateur")
          : product.fileName ?? "Téléchargement après confirmation du paiement";

  return (
    <div className="page-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/">Découvrir</Link><span>›</span><Link href={`/?q=${encodeURIComponent(product.category)}#decouvrir`}>{product.category}</Link><span>›</span><span>{product.title}</span></nav>
      <div className="detail-layout">
        <aside className="detail-content" aria-label="Acheter ce produit">
          <div className="detail-heading">
            <p className="page-eyebrow">{product.category}</p>
            <h1>{product.title}</h1>
            <p className="detail-subtitle">{product.subtitle}</p>
          </div>
          <div className="detail-purchase">
            <div className="detail-prices">
              {product.compareAtPrice !== undefined && product.compareAtPrice > product.price && <p className="compare-at-price"><span className="sr-only">Prix de référence : </span><s>{formatPrice(product.compareAtPrice, product.currency)}</s></p>}
              <p className="detail-price">{formatPrice(product.price, product.currency)}{product.kind === "membership" && <small> / mois</small>}</p>
            </div>
            {checkoutAvailable && <Link className="button button-dark detail-buy-button" href={checkoutHref} ref={purchaseRef}>
              {purchaseLabel}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>}
            <div className="demo-note"><ShieldCheck size={17} /><span>{liveMode ? liveProduct ? "Votre achat est associé à votre compte après confirmation du paiement." : "Fiche de présentation : le paiement réel n’est pas ouvert pour cet exemple." : "Achat simulé. Aucun paiement réel ne sera effectué."}</span></div>
            {(product.saveForLaterEnabled !== false || saved) && <button className={`button button-light favorite-wide${saved ? " is-saved" : ""}`} type="button" aria-pressed={saved} onClick={() => toggleFavorite(product.id)}>
              <Heart size={17} weight={saved ? "fill" : "regular"} /> {saved ? "Retirer des favoris" : "Enregistrer pour plus tard"}
            </button>}
            <div className="detail-creator">
              <span className={`avatar avatar-${product.creatorTone}`}>{product.creatorInitials}</span>
              <div><Link href={`/createurs/${product.creatorSlug}`}>{product.creatorName}</Link><p>Créateur indépendant</p></div>
              <Link className="creator-arrow" href={`/createurs/${product.creatorSlug}`} aria-label={`Voir la boutique de ${product.creatorName}`}><ArrowLeft size={17} /></Link>
            </div>
          </div>
        </aside>
        <div className="detail-main">
          <div className="detail-cover"><ProductCover product={product} eager /></div>
          <div className="detail-body">
            <RichTextContent className="detail-description" value={product.descriptionContent} fallbackText={product.description} productId={product.id} localContent={!supabaseConfigured || user?.isDemo || !/^[0-9a-f-]{36}$/i.test(product.id)} />
            <div className="detail-info"><span>{kindLabels[product.kind]}</span><span>{detailText}</span>{product.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            {product.kind === "course" && <Link className="text-link course-preview-link" href={`/apprendre/${encodeURIComponent(product.slug)}`}>Voir les leçons en aperçu</Link>}
            {product.kind === "membership" && publicContent?.membershipCourseIds.length ? <section className="included-course-list public-included-courses"><h2>Cours compris dans l’abonnement</h2>{publicContent.membershipCourseIds.map((courseId) => products.find((item) => item.id === courseId)).filter((course) => course?.kind === "course" && course.published).map((course) => <Link className="included-course-link" key={course!.id} href={`/produits/${encodeURIComponent(course!.slug)}`}><span>{course!.title}</span><ArrowRight size={16} /></Link>)}</section> : null}
          </div>
        </div>
      </div>
      {related.length > 0 && <section className="related-section"><div className="section-heading"><div><p className="page-eyebrow">Même univers</p><h2>À découvrir aussi</h2></div><Link className="text-link" href={`/?q=${encodeURIComponent(product.category)}#decouvrir`}>Tout voir <ArrowRight size={15} /></Link></div><div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
      {checkoutAvailable && <MobilePurchaseBar key={product.id} product={product} label={purchaseLabel} checkoutHref={checkoutHref} purchaseRef={purchaseRef} />}
    </div>
  );
}
