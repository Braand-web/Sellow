"use client";

import { publicErrorMessage } from "@/lib/copy.mjs";
import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, Camera, DownloadSimple, Package, Sparkle } from "@phosphor-icons/react";
import type { ElementType } from "react";
import { useMarketplace } from "@/app/providers";
import { kindLabels, productKinds, type ProductContent, type ProductFile, type ProductKind } from "@/lib/types";
import { emptyProductContent, hasPublishableContent } from "@/lib/product-content";
import { ProductContentEditor } from "@/components/product-content-editor";
import { ProductFilesEditor } from "@/components/product-files-editor";
import { ProductSaleOptions } from "@/components/product-sale-options";
import { formatPrice } from "@/components/product-card";
import { RichTextEditor } from "@/components/rich-text-editor";
import { documentFromPlainText, richTextToPlainText, type RichTextDocument } from "@/lib/rich-text";

const descriptions: Record<ProductKind, string> = {
  download: "Un fichier, un modèle ou une ressource à télécharger.",
  course: "Des leçons et des ressources à suivre à votre rythme.",
  membership: "Un accès récurrent à du contenu ou une communauté.",
  physical: "Un objet préparé et envoyé par vos soins.",
  service: "Une prestation organisée directement avec votre client.",
};

const typeIcons: Record<ProductKind, ElementType> = {
  download: DownloadSimple,
  course: BookOpenText,
  membership: Sparkle,
  physical: Package,
  service: Camera,
};

export function NewProductPage() {
  const router = useRouter();
  const { user, ready, addProduct, products, saveProductContent, togglePublished, supabaseConfigured } = useMarketplace();
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  const [kind, setKind] = useState<ProductKind>("download");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [descriptionContent, setDescriptionContent] = useState<RichTextDocument>(() => documentFromPlainText(""));
  const [descriptionFiles, setDescriptionFiles] = useState<Record<string, File>>({});
  const [category, setCategory] = useState("Design");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("12");
  const [currency, setCurrency] = useState("EUR");
  const [files, setFiles] = useState<ProductFile[]>([]);
  const [fileUploads, setFileUploads] = useState<Record<string, File>>({});
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [saveForLaterEnabled, setSaveForLaterEnabled] = useState(true);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverImageName, setCoverImageName] = useState("");
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  const [coverImageBusy, setCoverImageBusy] = useState(false);
  const [content, setContent] = useState<ProductContent>(emptyProductContent);
  const [contentFiles, setContentFiles] = useState<Record<string, File>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/connexion?next=%2Fstudio%2Fnouveau");
  }, [ready, user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const publishOnCreate = submitter instanceof HTMLButtonElement && submitter.value === "publish";
    const plainDescription = richTextToPlainText(descriptionContent);
    if (plainDescription.trim().length < 20) {
      setError("La description doit contenir au moins 20 caractères.");
      return;
    }
    if (publishOnCreate && kind === "course" && !hasPublishableContent(content, kind)) {
      setError("Ajoutez au moins une leçon avec du texte, une vidéo ou un fichier avant de publier ce cours.");
      return;
    }
    setBusy(true);
    try {
      const created = await addProduct({
        title,
        subtitle,
        description: plainDescription,
        descriptionContent,
        descriptionFiles,
        kind,
        category,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        price: Number(price),
        currency,
        cover: coverImage ?? coverForKind(kind),
        coverLabel: `${title.trim().toLocaleUpperCase("fr-FR").slice(0, 22)}\nÀ DÉCOUVRIR`,
        files,
        fileUploads,
        compareAtPrice: compareAtPrice === "" ? undefined : Number(compareAtPrice),
        saveForLaterEnabled,
      });
      if (kind === "course" || kind === "membership") await saveProductContent(created.id, content, contentFiles, created);
      if (publishOnCreate) await togglePublished(created.id, created);
      router.push(`/studio?created=${encodeURIComponent(created.slug)}`);
    } catch (creationError) {
      setError(publicErrorMessage(creationError, "Le produit n’a pas pu être enregistré."));
    } finally {
      setBusy(false);
    }
  }

  async function selectCoverImage(input: HTMLInputElement) {
    const selected = input.files?.[0];
    if (!selected) return;
    input.value = "";
    setCoverImageError(null);
    setCoverImageBusy(true);
    try {
      const optimized = await optimizeCoverImage(selected);
      setCoverImage(optimized);
      setCoverImageName(selected.name);
    } catch (imageError) {
      setCoverImageError(publicErrorMessage(imageError, "L’image n’a pas pu être chargée."));
    } finally {
      setCoverImageBusy(false);
    }
  }

  if (!ready || !user) return <div className="page-wrap"><div className="loading-card" /></div>;

  return (
    <div className="page-wrap new-product-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/studio"><ArrowLeft size={14} /> Tableau de bord</Link><span>›</span><span>Nouveau produit</span></nav>
      <div className="page-title-row"><div><p className="page-eyebrow">Votre prochaine création</p><h1 className="page-title">Créer un produit</h1><p className="page-lead">Présentez votre offre, ajoutez vos contenus et choisissez un prix. Publiez quand votre fiche est prête.</p></div></div>
      {user.isDemo && <div className="dashboard-notice"><span /> Démonstration locale : la fiche et son image restent dans ce navigateur. Aucun fichier n’est envoyé vers un stockage distant.</div>}
      <form className="new-product-form" onSubmit={submit}>
        <section className="new-product-main">
          <div className="form-panel"><div className="form-section-heading"><span>01</span><div><h2>Que souhaitez-vous vendre ?</h2><p>Le type ne pourra pas être modifié après création.</p></div></div>
            <div className="type-picker">{productKinds.map((productKind) => { const Icon = typeIcons[productKind]; return <button className="type-option" type="button" key={productKind} aria-pressed={kind === productKind} onClick={() => setKind(productKind)}><Icon size={21} /><span><strong>{kindLabels[productKind]}</strong><span>{descriptions[productKind]}</span></span></button>; })}</div>
          </div>
          <div className="form-panel"><div className="form-section-heading"><span>02</span><div><h2>Présentez votre produit</h2><p>Expliquez ce que votre client recevra et à qui votre produit s’adresse.</p></div></div>
            <div className="form-stack">
              <div className="field-group"><label htmlFor="product-title">Nom du produit</label><input className="field-input" id="product-title" required minLength={3} maxLength={70} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Exemple : Le carnet des petites idées" /></div>
              <div className="field-group"><label htmlFor="product-subtitle">Phrase de présentation</label><input className="field-input" id="product-subtitle" required maxLength={110} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Une phrase courte et précise" /></div>
              <RichTextEditor id="product-description" label="Description" required value={descriptionContent} onChange={setDescriptionContent} placeholder="Que recevra votre client ? À qui cette création peut-elle servir ?" files={descriptionFiles} onFilesChange={setDescriptionFiles} localContent={!supabaseConfigured || user.isDemo} />
              <div className="field-group"><label htmlFor="product-cover-image">Image de couverture</label><label className="file-drop" htmlFor="product-cover-image"><input id="product-cover-image" type="file" accept="image/jpeg,image/png,image/webp" aria-invalid={Boolean(coverImageError)} aria-describedby="cover-image-help" onChange={(event) => void selectCoverImage(event.currentTarget)} /><Camera size={22} /><strong>{coverImageBusy ? "Optimisation de l’image…" : coverImageName || "Choisir une image"}</strong><span id="cover-image-help">JPG, PNG ou WebP. Image compressée automatiquement, 12 Mo maximum.</span></label>{coverImage && <button className="text-link" type="button" onClick={() => { setCoverImage(null); setCoverImageName(""); }}>Retirer l’image</button>}{coverImageError && <p className="form-error" role="alert">{coverImageError}</p>}</div>
              {kind === "download" && <ProductFilesEditor value={files} uploads={fileUploads} onChange={setFiles} onUploadsChange={setFileUploads} />}
              {kind === "course" && <div className="course-outline"><BookOpenText size={20} /><div><strong>Un cours à suivre à son rythme</strong><p>Organisez vos modules et ajoutez les leçons, vidéos et ressources du cours.</p></div><span>À préparer</span></div>}
              {kind === "membership" && <div className="course-outline"><Sparkle size={20} /><div><strong>Accès mensuel</strong><p>{liveMode ? "Votre client paie un mois d’accès à la fois. Le renouvellement est manuel, sans prélèvement automatique." : "L’achat de démonstration ouvre un abonnement simulé, sans prélèvement réel."}</p></div><span>Mensuel</span></div>}
              {kind === "physical" && <div className="course-outline"><Package size={20} /><div><strong>Expédition manuelle</strong><p>{liveMode ? "Vous organisez l’expédition après confirmation de la commande." : "Vous recevrez l’adresse du client avec chaque commande de démonstration."}</p></div><span>Par vous</span></div>}
              {kind === "service" && <div className="course-outline"><Camera size={20} /><div><strong>Prestation à organiser</strong><p>Le client peut ajouter un message au moment de la commande.</p></div><span>Par vous</span></div>}
              <div className="form-two-col">
                <div className="field-group"><label htmlFor="product-category">Catégorie</label><select className="field-select" id="product-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>Design</option><option>Photographie</option><option>Illustration</option><option>Développement</option><option>Musique</option><option>Papeterie</option><option>Créativité</option><option>Entrepreneuriat</option></select></div>
                <div className="field-group"><label htmlFor="product-tags">Mots clés</label><input className="field-input" id="product-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="figma, création, modèle" /><span className="field-help">Séparez les mots clés par une virgule.</span></div>
              </div>
            </div>
          </div>
          <div className="form-panel"><div className="form-section-heading"><span>03</span><div><h2>Choisissez un prix</h2><p>Votre client verra le prix dans la devise sélectionnée.</p></div></div>
            <div className="form-two-col price-row"><div className="field-group"><label htmlFor="product-price">Prix</label><input className="field-input" id="product-price" type="number" min="0" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></div><div className="field-group"><label htmlFor="product-currency">Devise</label><select className="field-select" id="product-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="EUR">EUR · Euro</option><option value="USD">USD · Dollar américain</option><option value="XOF">XOF · FCFA Afrique de l’Ouest</option><option value="XAF">XAF · FCFA Afrique centrale</option><option value="MAD">MAD · Dirham marocain</option></select></div></div>
          </div>
          <div className="form-panel"><h2>Options de vente</h2><ProductSaleOptions price={price} compareAtPrice={compareAtPrice} saveForLaterEnabled={saveForLaterEnabled} currency={currency} onCompareAtPriceChange={setCompareAtPrice} onSaveForLaterChange={setSaveForLaterEnabled} /></div>
          {(kind === "course" || kind === "membership") && <ProductContentEditor kind={kind} value={content} products={products} creatorId={user.id} localContent={!supabaseConfigured || user.isDemo} files={contentFiles} onChange={setContent} onFilesChange={setContentFiles} />}
        </section>
        <aside className="new-product-aside">
          <div className="form-panel preview-panel">
            <p className="page-eyebrow">Aperçu de la fiche</p>
            <div className={`preview-cover cover-${coverForKind(kind)}${coverImage ? " preview-cover-with-image" : ""}`}>
              {coverImage && <Image src={coverImage} alt="" fill unoptimized className="preview-cover-image" />}
              {!coverImage && <><span>{kindLabels[kind]}</span><strong>{title || "Votre création"}</strong></>}
            </div>
            <h3>{title || "Nom du produit"}</h3><p>{subtitle || "Votre phrase de présentation apparaîtra ici."}</p>
            {compareAtPrice && Number(compareAtPrice) > Number(price) && <s className="compare-at-price">{formatPrice(Number(compareAtPrice), currency)}</s>}
            <div className="preview-price">{price ? formatPrice(Number(price), currency) : "Prix"}{kind === "membership" ? " / mois" : ""}</div>
          </div>
          <div className="demo-note"><Sparkle size={16} /><span>Enregistrez en brouillon ou publiez directement le produit. Vous pourrez ensuite le modifier dans votre espace.</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="publish-actions">
            <button className="button button-light button-small publish-button" type="submit" name="intent" value="draft" disabled={busy || coverImageBusy}>{busy ? "Enregistrement…" : "Enregistrer comme brouillon"}</button>
            <button className="button button-dark publish-button" type="submit" name="intent" value="publish" disabled={busy || coverImageBusy}>{busy ? "Enregistrement…" : "Publier le produit"}<ArrowRight size={17} /></button>
          </div>
          <Link className="text-link cancel-link" href="/studio">Annuler</Link>
        </aside>
      </form>
    </div>
  );
}

function coverForKind(kind: ProductKind) {
  return ({ download: "identity", course: "photography", membership: "membership", physical: "notebook", service: "portfolio" } as const)[kind];
}

async function optimizeCoverImage(file: File) {
  const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!acceptedTypes.includes(file.type)) throw new Error("Choisissez une image JPG, PNG ou WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("L’image doit faire moins de 12 Mo.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Le navigateur n’a pas pu ouvrir cette image. Essayez un autre fichier.");
  }

  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * scale));
  let height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("L’image n’a pas pu être optimisée dans ce navigateur.");
  }

  let blob: Blob | null = null;
  try {
    for (const [attempt, quality] of [0.82, 0.72, 0.62, 0.54].entries()) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= 250_000) break;
      if (attempt >= 1) {
        width = Math.max(1, Math.round(width * 0.82));
        height = Math.max(1, Math.round(height * 0.82));
      }
    }
  } finally {
    bitmap.close();
  }

  if (!blob || blob.size > 250_000) throw new Error("Cette image reste trop lourde. Essayez une image plus légère.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("L’image n’a pas pu être lue."));
    reader.onerror = () => reject(new Error("L’image n’a pas pu être lue."));
    reader.readAsDataURL(blob);
  });
}
