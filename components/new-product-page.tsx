"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, Camera, DownloadSimple, Package, Sparkle } from "@phosphor-icons/react";
import type { ElementType } from "react";
import { useMarketplace } from "@/app/providers";
import { kindLabels, productKinds, type ProductContent, type ProductKind } from "@/lib/types";
import { emptyProductContent } from "@/lib/product-content";
import { ProductContentEditor } from "@/components/product-content-editor";

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
  const { user, ready, addProduct, products, saveProductContent } = useMarketplace();
  const [kind, setKind] = useState<ProductKind>("download");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Design");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("12");
  const [currency, setCurrency] = useState("EUR");
  const [file, setFile] = useState<File | null>(null);
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
    setBusy(true);
    try {
      const created = await addProduct({
        title,
        subtitle,
        description,
        kind,
        category,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        price: Number(price),
        currency,
        cover: coverForKind(kind),
        coverLabel: `${title.trim().toLocaleUpperCase("fr-FR").slice(0, 22)}\nÀ DÉCOUVRIR`,
        file,
      });
      if (kind === "course" || kind === "membership") await saveProductContent(created.id, content, contentFiles, created);
      router.push(`/studio?created=${encodeURIComponent(created.slug)}`);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "Le produit n’a pas pu être enregistré.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user) return <div className="page-wrap"><div className="loading-card" /></div>;

  return (
    <div className="page-wrap new-product-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href="/studio"><ArrowLeft size={14} /> Tableau de bord</Link><span>›</span><span>Nouveau produit</span></nav>
      <div className="page-title-row"><div><p className="page-eyebrow">Votre prochaine création</p><h1 className="page-title">Créer un produit</h1><p className="page-lead">Présentez ce que vous faites et choisissez comment le partager.</p></div></div>
      {user.isDemo && <div className="dashboard-notice"><span /> Mode local : le fichier n’est pas téléversé vers un stockage privé tant que Supabase n’est pas configuré.</div>}
      <form className="new-product-form" onSubmit={submit}>
        <section className="new-product-main">
          <div className="form-panel"><div className="form-section-heading"><span>01</span><div><h2>Quel type de création ?</h2><p>Le type ne pourra pas être modifié après création.</p></div></div>
            <div className="type-picker">{productKinds.map((productKind) => { const Icon = typeIcons[productKind]; return <button className="type-option" type="button" key={productKind} aria-pressed={kind === productKind} onClick={() => setKind(productKind)}><Icon size={21} /><span><strong>{kindLabels[productKind]}</strong><span>{descriptions[productKind]}</span></span></button>; })}</div>
          </div>
          <div className="form-panel"><div className="form-section-heading"><span>02</span><div><h2>Présentez votre produit</h2><p>Donnez envie aux bonnes personnes de le découvrir.</p></div></div>
            <div className="form-stack">
              <div className="field-group"><label htmlFor="product-title">Nom du produit</label><input className="field-input" id="product-title" required minLength={3} maxLength={70} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Exemple : Le carnet des petites idées" /></div>
              <div className="field-group"><label htmlFor="product-subtitle">Phrase de présentation</label><input className="field-input" id="product-subtitle" required maxLength={110} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Une phrase courte et précise" /></div>
              <div className="field-group"><label htmlFor="product-description">Description</label><textarea className="field-textarea" id="product-description" required minLength={20} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Que recevra votre client ? À qui cette création peut elle servir ?" /></div>
              {kind === "download" && <div className="field-group"><label htmlFor="product-file">Fichier à remettre</label><label className="file-drop" htmlFor="product-file"><input id="product-file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><DownloadSimple size={22} /><strong>{file?.name ?? "Choisir un fichier"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} Mo` : "Fichier privé, remis après l’achat"}</span></label></div>}
              {kind === "course" && <div className="course-outline"><BookOpenText size={20} /><div><strong>Apprentissage à son rythme</strong><p>Créez les modules, leçons et vidéos plus bas.</p></div><span>À préparer</span></div>}
              {kind === "membership" && <div className="course-outline"><Sparkle size={20} /><div><strong>Accès mensuel</strong><p>Le checkout de démonstration simulera un abonnement mensuel.</p></div><span>Mensuel</span></div>}
              {kind === "physical" && <div className="course-outline"><Package size={20} /><div><strong>Expédition manuelle</strong><p>Vous recevrez l’adresse du client avec chaque commande de démonstration.</p></div><span>Par vous</span></div>}
              {kind === "service" && <div className="course-outline"><Camera size={20} /><div><strong>Prestation à organiser</strong><p>Le client peut ajouter un message au moment de la commande.</p></div><span>Par vous</span></div>}
              <div className="form-two-col">
                <div className="field-group"><label htmlFor="product-category">Catégorie</label><select className="field-select" id="product-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>Design</option><option>Photographie</option><option>Illustration</option><option>Développement</option><option>Musique</option><option>Papeterie</option><option>Créativité</option></select></div>
                <div className="field-group"><label htmlFor="product-tags">Mots clés</label><input className="field-input" id="product-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="figma, création, modèle" /><span className="field-help">Séparez les mots clés par une virgule.</span></div>
              </div>
            </div>
          </div>
          <div className="form-panel"><div className="form-section-heading"><span>03</span><div><h2>Choisissez un prix</h2><p>Le prix sera affiché dans la devise choisie.</p></div></div>
            <div className="form-two-col price-row"><div className="field-group"><label htmlFor="product-price">Prix</label><input className="field-input" id="product-price" type="number" min="0" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></div><div className="field-group"><label htmlFor="product-currency">Devise</label><select className="field-select" id="product-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="EUR">EUR · Euro</option><option value="USD">USD · Dollar américain</option><option value="XOF">XOF · Franc CFA</option><option value="MAD">MAD · Dirham marocain</option></select></div></div>
          </div>
          {(kind === "course" || kind === "membership") && <ProductContentEditor kind={kind} value={content} products={products} creatorId={user.id} files={contentFiles} onChange={setContent} onFilesChange={setContentFiles} />}
        </section>
        <aside className="new-product-aside"><div className="form-panel preview-panel"><p className="page-eyebrow">Aperçu de la fiche</p><div className={`preview-cover cover-${coverForKind(kind)}`}><span>{kindLabels[kind]}</span><strong>{title || "Votre création"}</strong></div><h3>{title || "Nom du produit"}</h3><p>{subtitle || "Votre phrase de présentation apparaîtra ici."}</p><div className="preview-price">{price ? new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(price)) : "Prix"}{kind === "membership" ? " / mois" : ""}</div></div><div className="demo-note"><Sparkle size={16} /><span>Le nouveau produit sera enregistré comme brouillon. Vous pourrez le publier depuis votre espace.</span></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark publish-button" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le brouillon"}<ArrowRight size={17} /></button><Link className="text-link cancel-link" href="/studio">Annuler</Link></aside>
      </form>
    </div>
  );
}

function coverForKind(kind: ProductKind) {
  return ({ download: "identity", course: "photography", membership: "membership", physical: "notebook", service: "portfolio" } as const)[kind];
}
