"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, ShieldCheck } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCard, formatPrice } from "@/components/product-card";
import { ProductCover } from "@/components/product-cover";
import { kindLabels } from "@/lib/types";
import type { ProductContent } from "@/lib/types";
import { RichTextContent } from "@/components/rich-text-content";

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { products, favorites, toggleFavorite, ready, loadProductContent, supabaseConfigured, user } = useMarketplace();
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  const product = products.find((item) => item.slug === slug);
  const liveProduct = Boolean(product?.isRemote);
  const [publicContent, setPublicContent] = useState<ProductContent | null>(null);
  useEffect(() => {
    if (product?.kind !== "membership") return;
    let cancelled = false;
    void loadProductContent(product).then((content) => { if (!cancelled) setPublicContent(content); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [loadProductContent, product]);

  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  if (!product || !product.published) {
    return <section className="not-found"><div><p className="page-eyebrow">Produit introuvable</p><h1>Cette création n’est plus là.</h1><p>Elle a peut être été dépubliée par son créateur.</p><Link className="button button-dark" href="/">Retour à la découverte <ArrowRight size={16} /></Link></div></section>;
  }

  const saved = favorites.includes(product.id);
  const related = products.filter((item) => item.id !== product.id && item.published && item.category === product.category).slice(0, 3);
  const detailText = product.kind === "course"
    ? `${product.details?.courseLessons?.length ?? product.details?.lessons ?? 8} leçons · ${product.details?.duration ?? "À votre rythme"}`
    : product.kind === "membership"
      ? `Accès renouvelé chaque ${product.details?.interval ?? "mois"}`
      : product.kind === "physical"
        ? String(product.details?.shipping ?? "Expédition organisée par le créateur")
        : product.kind === "service"
          ? String(product.details?.fulfillment ?? "Une prestation organisée avec le créateur")
          : product.fileName ?? "Accès immédiat après l’achat";

  return (
    <div className="page-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/">Découvrir</Link><span>›</span><Link href={`/?q=${encodeURIComponent(product.category)}#decouvrir`}>{product.category}</Link><span>›</span><span>{product.title}</span></nav>
      <div className="detail-layout">
        <div>
          <div className="detail-cover"><ProductCover product={product} /></div>
          <RichTextContent className="detail-description" value={product.descriptionContent} fallbackText={product.description} productId={product.id} localContent={!supabaseConfigured || user?.isDemo || !/^[0-9a-f-]{36}$/i.test(product.id)} />
          <div className="detail-info"><span>{kindLabels[product.kind]}</span><span>{detailText}</span>{product.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
          {product.kind === "course" && <Link className="text-link course-preview-link" href={`/apprendre/${encodeURIComponent(product.slug)}`}>Voir les leçons en aperçu</Link>}
          {product.kind === "membership" && publicContent?.membershipCourseIds.length ? <section className="included-course-list public-included-courses"><h2>Cours compris dans l’abonnement</h2>{publicContent.membershipCourseIds.map((courseId) => products.find((item) => item.id === courseId)).filter((course) => course?.kind === "course" && course.published).map((course) => <Link className="included-course-link" key={course!.id} href={`/produits/${encodeURIComponent(course!.slug)}`}><span>{course!.title}</span><ArrowRight size={16} /></Link>)}</section> : null}
        </div>
        <aside className="detail-content" aria-label="Acheter ce produit">
          <p className="page-eyebrow">{product.category}</p>
          <h1>{product.title}</h1>
          <p className="detail-subtitle">{product.subtitle}</p>
          {product.compareAtPrice !== undefined && product.compareAtPrice > product.price && <p className="compare-at-price"><span className="sr-only">Prix de référence : </span><s>{formatPrice(product.compareAtPrice, product.currency)}</s></p>}
          <p className="detail-price">{formatPrice(product.price, product.currency)}{product.kind === "membership" && <small> / mois</small>}</p>
          <div className="demo-note"><ShieldCheck size={17} /><span>{liveMode ? liveProduct ? "Le paiement est traité sur le checkout hébergé SasPay." : "Fiche de présentation : le paiement réel n’est pas ouvert pour cet exemple." : "Checkout de démonstration. Aucun paiement réel ne sera effectué."}</span></div>
          {(!liveMode || liveProduct) && <Link className="button button-dark" href={`/checkout/${product.slug}`}>
            {product.kind === "membership" ? "Choisir cet abonnement" : product.kind === "service" ? "Demander ce service" : product.price === 0 ? "Obtenir le produit" : "Acheter ce produit"}
            <ArrowRight size={17} />
          </Link>}
          {(product.saveForLaterEnabled !== false || saved) && <button className={`button button-light favorite-wide${saved ? " is-saved" : ""}`} type="button" aria-pressed={saved} onClick={() => toggleFavorite(product.id)}>
            <Heart size={17} weight={saved ? "fill" : "regular"} /> {saved ? "Retirer des favoris" : "Enregistrer pour plus tard"}
          </button>}
          <div className="detail-creator">
            <span className={`avatar avatar-${product.creatorTone}`}>{product.creatorInitials}</span>
            <div><Link href={`/createurs/${product.creatorSlug}`}>{product.creatorName}</Link><p>Créateur indépendant</p></div>
            <Link className="creator-arrow" href={`/createurs/${product.creatorSlug}`} aria-label={`Voir la boutique de ${product.creatorName}`}><ArrowLeft size={17} /></Link>
          </div>
        </aside>
      </div>
      {related.length > 0 && <section className="related-section"><div className="section-heading"><div><p className="page-eyebrow">Même univers</p><h2>À découvrir aussi</h2></div><Link className="text-link" href={`/?q=${encodeURIComponent(product.category)}#decouvrir`}>Tout voir <ArrowRight size={15} /></Link></div><div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
    </div>
  );
}
