import Image from "next/image";
import type { Product } from "@/lib/types";

export function ProductCover({ product, compact = false, eager = false }: { product: Product; compact?: boolean; eager?: boolean }) {
  const hasUploadedImage = /^https:\/\//i.test(product.cover) || /^data:image\/(?:webp|png|jpeg);base64,/i.test(product.cover);

  return (
    <div className={`product-cover${hasUploadedImage ? " product-cover-custom" : ` cover-${product.cover}`}${compact ? " product-cover-compact" : ""}`} role="img" aria-label={product.title}>
      {hasUploadedImage ? (
        <Image src={product.cover} alt="" fill sizes="(max-width: 780px) 100vw, 50vw" unoptimized loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} className="product-cover-image" />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
