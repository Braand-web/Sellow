"use client";

import { publicErrorMessage } from "@/lib/copy.mjs";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMarketplace } from "@/app/providers";
import type { ProductContent, ProductFile } from "@/lib/types";
import { emptyProductContent, hasPublishableContent } from "@/lib/product-content";
import { ProductContentEditor } from "@/components/product-content-editor";
import { ProductFilesEditor } from "@/components/product-files-editor";
import { ProductSaleOptions } from "@/components/product-sale-options";
import { RichTextEditor } from "@/components/rich-text-editor";
import { documentFromPlainText, richTextToPlainText, type RichTextDocument } from "@/lib/rich-text";

const categories = ["Design", "Photographie", "Illustration", "Développement", "Musique", "Papeterie", "Créativité", "Entrepreneuriat"];

export function EditProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const router = useRouter();
  const { user, products, ready, updateProduct, loadProductContent, saveProductContent, loadProductFiles, supabaseConfigured } = useMarketplace();
  const product = useMemo(() => products.find((item) => item.id === productId), [productId, products]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [descriptionContent, setDescriptionContent] = useState<RichTextDocument>(() => documentFromPlainText(""));
  const [descriptionFiles, setDescriptionFiles] = useState<Record<string, File>>({});
  const [category, setCategory] = useState("Design");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("0");
  const [currency, setCurrency] = useState("EUR");
  const [files, setFiles] = useState<ProductFile[]>([]);
  const [fileUploads, setFileUploads] = useState<Record<string, File>>({});
  const [loadedFilesId, setLoadedFilesId] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [saveForLaterEnabled, setSaveForLaterEnabled] = useState(true);
  const [content, setContent] = useState<ProductContent>(emptyProductContent);
  const [loadedContentId, setLoadedContentId] = useState("");
  const [contentFiles, setContentFiles] = useState<Record<string, File>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/connexion?next=%2Fstudio");
    else if (product && product.creatorId !== user.id) router.replace("/studio");
  }, [product, ready, router, user]);

  useEffect(() => {
    if (!product) return;
    // Populate the editor once the product is available from local storage or Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(product.title);
    setSubtitle(product.subtitle);
    setDescriptionContent(product.descriptionContent ?? documentFromPlainText(product.description));
    setCategory(product.category);
    setTags(product.tags.join(", "));
    setPrice(String(product.price));
    setCurrency(product.currency);
    setCompareAtPrice(product.compareAtPrice === undefined ? "" : String(product.compareAtPrice));
    setSaveForLaterEnabled(product.saveForLaterEnabled !== false);
    let cancelled = false;
    if (product.kind === "download") void loadProductFiles(product).then((nextFiles) => { if (!cancelled) { setFiles(nextFiles); setLoadedFilesId(product.id); } }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Les fichiers n’ont pas pu être chargés."); });
    if (product.kind === "course" || product.kind === "membership") {
      void loadProductContent(product)
        .then((nextContent) => { setContent(nextContent); setLoadedContentId(product.id); })
        .catch((loadError) => setError(publicErrorMessage(loadError, "Le contenu n’a pas pu être chargé.")));
    }
    return () => { cancelled = true; };
  }, [loadProductContent, loadProductFiles, product]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const plainDescription = richTextToPlainText(descriptionContent);
      if (plainDescription.trim().length < 20) throw new Error("La description doit contenir au moins 20 caractères.");
      if (product.kind === "course" && product.published && !hasPublishableContent(content, product.kind)) {
        throw new Error("Ajoutez au moins une leçon avec du texte, une vidéo ou un fichier avant d’enregistrer ce cours publié.");
      }
      if (product.kind === "course" || product.kind === "membership") await saveProductContent(product.id, content, contentFiles);
      await updateProduct(product.id, {
        title,
        subtitle,
        description: plainDescription,
        descriptionContent,
        descriptionFiles,
        category,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        price: Number(price),
        compareAtPrice: compareAtPrice === "" ? undefined : Number(compareAtPrice),
        saveForLaterEnabled,
        files: product.kind === "download" ? files : undefined,
        fileUploads,
        currency,
        cover: product.cover,
        coverLabel: `${title.trim().toLocaleUpperCase("fr-FR").slice(0, 22)}\nÀ DÉCOUVRIR`,
      });
      router.push("/studio");
    } catch (saveError) {
      setError(publicErrorMessage(saveError, "Les modifications n’ont pas pu être enregistrées."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user || !product || product.creatorId !== user.id) return <div className="page-wrap"><div className="loading-card" /></div>;
  const contentReady = ((product.kind !== "course" && product.kind !== "membership") || loadedContentId === product.id) && (product.kind !== "download" || loadedFilesId === product.id);

  return (
    <div className="page-wrap new-product-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/studio"><ArrowLeft size={14} /> Tableau de bord</Link><span>›</span><span>Modifier le produit</span></nav>
      <div className="page-title-row"><div><p className="page-eyebrow">Votre produit</p><h1 className="page-title">Modifier « {product.title} »</h1><p className="page-lead">Le type reste {product.kind === "download" ? "un fichier numérique" : product.kind === "course" ? "un cours" : product.kind === "membership" ? "un abonnement" : product.kind === "physical" ? "un objet physique" : "un service"}.</p></div></div>
      <form className="new-product-form" onSubmit={submit}>
        <section className="new-product-main">
          <div className="form-panel"><div className="form-section-heading"><span>01</span><div><h2>Informations du produit</h2><p>Mettez à jour votre présentation et vos contenus. Le format choisi à la création reste fixe.</p></div></div><div className="form-stack">
            <div className="field-group"><label htmlFor="edit-title">Nom du produit</label><input className="field-input" id="edit-title" required minLength={3} maxLength={70} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
            <div className="field-group"><label htmlFor="edit-subtitle">Phrase de présentation</label><input className="field-input" id="edit-subtitle" required maxLength={110} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></div>
            <RichTextEditor id="edit-description" label="Description" required value={descriptionContent} onChange={setDescriptionContent} files={descriptionFiles} onFilesChange={setDescriptionFiles} productId={product.id} localContent={!supabaseConfigured || user.isDemo} />
            <div className="form-two-col"><div className="field-group"><label htmlFor="edit-category">Catégorie</label><select className="field-select" id="edit-category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label htmlFor="edit-tags">Mots clés</label><input className="field-input" id="edit-tags" value={tags} onChange={(event) => setTags(event.target.value)} /><span className="field-help">Séparez les mots clés par une virgule.</span></div></div>
            <div className="form-two-col"><div className="field-group"><label htmlFor="edit-price">Prix</label><input className="field-input" id="edit-price" type="number" min="0" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></div><div className="field-group"><label htmlFor="edit-currency">Devise</label><select className="field-select" id="edit-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="EUR">EUR · Euro</option><option value="USD">USD · Dollar américain</option><option value="XOF">XOF · FCFA Afrique de l’Ouest</option><option value="XAF">XAF · FCFA Afrique centrale</option><option value="MAD">MAD · Dirham marocain</option></select></div></div>
          </div></div>

          {product.kind === "download" && loadedFilesId === product.id && <div className="form-panel"><ProductFilesEditor value={files} uploads={fileUploads} onChange={setFiles} onUploadsChange={setFileUploads} /></div>}
          <div className="form-panel"><h2>Options de vente</h2><ProductSaleOptions price={price} compareAtPrice={compareAtPrice} saveForLaterEnabled={saveForLaterEnabled} currency={currency} onCompareAtPriceChange={setCompareAtPrice} onSaveForLaterChange={setSaveForLaterEnabled} /></div>
          {(product.kind === "course" || product.kind === "membership") && <ProductContentEditor kind={product.kind} value={content} products={products} creatorId={user.id} productId={product.id} localContent={!supabaseConfigured || user.isDemo} files={contentFiles} onChange={setContent} onFilesChange={setContentFiles} />}
        </section>
        <aside className="new-product-aside"><div className="demo-note"><span /> Enregistrez vos modifications pour mettre à jour la fiche et les contenus de votre produit.</div>{!contentReady && <p className="field-help" role="status">Chargement du contenu privé…</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark publish-button" type="submit" disabled={busy || !contentReady}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button><Link className="text-link cancel-link" href="/studio">Annuler</Link></aside>
      </form>
    </div>
  );
}
