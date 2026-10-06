"use client";

import Link from "next/link";
import { Heart } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { kindLabels, type Product } from "@/lib/types";
import { ProductCover } from "@/components/product-cover";

export function formatPrice(price: number, currency: string) {
  if (price === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}

export function ProductCard({ product }: { product: Product }) {
  const { favorites, toggleFavorite } = useMarketplace();
  const saved = favorites.includes(product.id);

  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={`/produits/${product.slug}`} aria-label={`Voir ${product.title}`}>
          <ProductCover product={product} />
        </Link>
        <button
          type="button"
          className={`favorite-button${saved ? " is-saved" : ""}`}
          aria-label={saved ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={saved}
          onClick={() => toggleFavorite(product.id)}
        >
          <Heart size={18} weight={saved ? "fill" : "regular"} />
        </button>
      </div>
      <div className="product-card-meta">
        <span>{kindLabels[product.kind]}</span>
        {product.kind === "membership" && <span>Renouvellement mensuel</span>}
        {product.kind === "physical" && <span>Envoi par le créateur</span>}
      </div>
      <Link className="product-card-title" href={`/produits/${product.slug}`}>
        {product.title}
      </Link>
      <p className="product-card-subtitle">{product.subtitle}</p>
      <div className="product-card-bottom">
        <Link className="creator-mini" href={`/createurs/${product.creatorSlug}`}>
          <span className={`avatar avatar-${product.creatorTone}`}>{product.creatorInitials}</span>
          <span>{product.creatorName}</span>
        </Link>
        <strong>{formatPrice(product.price, product.currency)}{product.kind === "membership" ? <small> / mois</small> : null}</strong>
      </div>
    </article>
  );
}
