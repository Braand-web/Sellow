import { ImageSquare } from "@phosphor-icons/react";

export function ProductImageGuidelines({ id }: { id?: string }) {
  return (
    <aside id={id} className="cover-image-guide" aria-label="Conseils pour les images de couverture">
      <ImageSquare size={24} aria-hidden="true" />
      <div>
        <p className="cover-image-guide-title">Dimensions conseillées pour votre couverture</p>
        <dl className="cover-image-formats">
          <div><dt>Paysage · format 4:3</dt><dd>1 200 × 900 px</dd></div>
          <div><dt>Carré · format 1:1</dt><dd>1 200 × 1 200 px</dd></div>
        </dl>
        <p>Le paysage occupe mieux les cartes du catalogue. Le carré convient aux couvertures de guides et de cours.</p>
        <p>JPG, PNG ou WebP, jusqu’à 12 Mo. Privilégiez une image nette et des textes assez grands pour être lus sur mobile.</p>
        <p>Ces dimensions sont des conseils. Les autres formats sont acceptés et l’image reste visible en entier, avec des marges si nécessaire.</p>
      </div>
    </aside>
  );
}
