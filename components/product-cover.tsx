import type { Product } from "@/lib/types";

export function ProductCover({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <div className={`product-cover cover-${product.cover}${compact ? " product-cover-compact" : ""}`} role="img" aria-label={product.title}>
      <div className="cover-spark cover-spark-one" />
      <div className="cover-spark cover-spark-two" />
      <div className="cover-frame">
        <span className="cover-kicker">{product.category}</span>
        <strong>
          {product.coverLabel.split("\n").map((line) => (
            <span key={line}>{line}</span>
          ))}
        </strong>
        <span className="cover-edition">PAR {product.creatorName.toLocaleUpperCase("fr-FR")}</span>
      </div>
      <span className="cover-kind">{product.kind === "membership" ? "MENSUEL" : "ÉDITION 01"}</span>
    </div>
  );
}
