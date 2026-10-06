"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Storefront } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCard } from "@/components/product-card";
import { seedCreators } from "@/lib/seed";

export function CreatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const { products, user, ready } = useMarketplace();
  const creatorProducts = products.filter((item) => item.creatorSlug === slug && item.published);
  const creator = user?.slug === slug
    ? user
    : seedCreators.find((item) => item.slug === slug) ?? (creatorProducts[0] ? {
      id: creatorProducts[0].creatorId,
      name: creatorProducts[0].creatorName,
      slug: creatorProducts[0].creatorSlug,
      email: "",
      bio: "Créateur indépendant sur Gumroad.",
      initials: creatorProducts[0].creatorInitials,
      tone: creatorProducts[0].creatorTone,
    } : null);


  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  if (!creator) return <section className="not-found"><div><p className="page-eyebrow">Boutique introuvable</p><h1>Cette page créateur n’existe pas.</h1><Link className="button button-dark" href="/">Retour à la découverte <ArrowRight size={16} /></Link></div></section>;

  return (
    <div className="page-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/">Découvrir</Link><span>›</span><span>{creator.name}</span></nav>
      <section className="creator-banner">
        <div className="creator-profile">
          <span className={`avatar avatar-${creator.tone}`}>{creator.initials}</span>
          <div><p className="page-eyebrow"><Storefront size={14} /> Boutique indépendante</p><h1>{creator.name}</h1><p>{creator.bio}</p></div>
        </div>
        {user?.slug === creator.slug && <Link className="button button-dark button-small" href="/studio">Gérer ma boutique <ArrowRight size={15} /></Link>}
      </section>
      <section className="creator-products">
        <div className="section-heading"><div><p className="page-eyebrow">La boutique</p><h2>Les créations de {creator.name.split(" ")[0]}</h2><p>{creatorProducts.length} produit{creatorProducts.length > 1 ? "s" : ""} disponible{creatorProducts.length > 1 ? "s" : ""}</p></div></div>
        {creatorProducts.length ? <div className="product-grid">{creatorProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><h2>La boutique prend forme</h2><p>Les nouvelles créations apparaîtront ici dès leur publication.</p></div>}
      </section>
    </div>
  );
}
