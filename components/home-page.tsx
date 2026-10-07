"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  Code,
  MagnifyingGlass,
  MusicNotes,
  Palette,
  Sparkle,
} from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { ProductCard } from "@/components/product-card";
import { ProductCover } from "@/components/product-cover";
import { WordReveal } from "@/components/word-reveal";
import { kindLabels, productKinds } from "@/lib/types";
import { brandCopy, commissionCopy, membershipCopy, paymentCopy } from "@/lib/copy.mjs";

const categories = ["Tout", "Design", "Photographie", "Illustration", "Développement", "Musique", "Papeterie", "Créativité"];

const categoryIcons: Record<string, ReactNode> = {
  Design: <Palette size={16} />,
  Photographie: <Sparkle size={16} />,
  Illustration: <BookOpenText size={16} />,
  Développement: <Code size={16} />,
  Musique: <MusicNotes size={16} />,
};

export function HomePage() {
  const { products } = useMarketplace();
  const liveMode = process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tout");
  const [kind, setKind] = useState("all");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("featured");
  const catalogProducts = useMemo(
    () => products.filter((product) => product.published && (!liveMode || product.isRemote)),
    [liveMode, products],
  );

  useEffect(() => {
    const search = new URLSearchParams(window.location.search).get("q");
    if (search) {
      // Seed the client-side catalog filter from the shareable search URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(search);
      window.setTimeout(() => document.getElementById("decouvrir")?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    const filtered = catalogProducts.filter((product) => {
      const matchesCategory = category === "Tout" || product.category === category;
      const matchesKind = kind === "all" || product.kind === kind;
      const matchesTag = !tag || product.tags.includes(tag);
      const searchable = [product.title, product.subtitle, product.description, product.creatorName, product.category, ...product.tags]
        .join(" ")
        .toLocaleLowerCase("fr-FR");
      return matchesCategory && matchesKind && matchesTag && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
    if (sort === "price-asc") return filtered.sort((a, b) => a.price - b.price);
    if (sort === "newest") return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }, [catalogProducts, category, kind, query, sort, tag]);

  const availableTags = useMemo(
    () => [...new Set(catalogProducts.flatMap((product) => product.tags))].sort((a, b) => a.localeCompare(b, "fr")),
    [catalogProducts],
  );
  const hasFilters = Boolean(query.trim() || category !== "Tout" || kind !== "all" || tag);

  function resetFilters() {
    setQuery("");
    setCategory("Tout");
    setKind("all");
    setTag("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("decouvrir")?.scrollIntoView({ behavior: "smooth" });
  }

  const heroProducts = catalogProducts.slice(0, 3);

  return (
    <>
      <div id="haut" className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> La marketplace des créateurs indépendants</p>
          <h1>Découvrez des créations. <span>Vendez les vôtres.</span></h1>
          <p className="hero-description">{brandCopy.description}</p>
          <form className="hero-search" role="search" onSubmit={submitSearch}>
            <label>
              <MagnifyingGlass size={20} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Un cours, un modèle, une création…" aria-label="Rechercher dans les produits" />
            </label>
            <button className="button button-dark" type="submit">{brandCopy.explore} <ArrowRight size={17} /></button>
          </form>
          <p className="hero-proof"><strong>Pour apprendre, créer et partager</strong> · Des produits proposés par leurs créateurs</p>
          <Link className="text-link hero-creator-link" href="/inscription">{brandCopy.createShop} <ArrowRight size={16} /></Link>
        </div>
        <div className="hero-art" aria-label="Sélection de créations Sellow">
          <div className="hero-art-circle" />
          {heroProducts[1] && <div className="floating-cover floating-cover-left"><ProductCover product={heroProducts[1]} compact /></div>}
          {heroProducts[2] && <div className="floating-cover floating-cover-right"><ProductCover product={heroProducts[2]} compact /></div>}
          {heroProducts[0] && <div className="floating-cover floating-cover-main"><ProductCover product={heroProducts[0]} compact /></div>}
          <span className="hero-sticker">CRÉATIONS<br />INDÉPENDANTES</span>
          <span className="hero-caption">Des ressources pour vos prochains projets <ArrowDownRight size={14} /></span>
        </div>
      </div>

      <section className="section-shell market-section" id="decouvrir" aria-labelledby="discover-title">
        <div className="section-heading">
          <div><p className="page-eyebrow">Pour vos prochains projets</p><h2 id="discover-title">Explorez les produits</h2><p>Trouvez une ressource utile, un cours à suivre ou une création qui vous plaît.</p></div>
          <a className="text-link" href="#categories">Voir les catégories <ArrowUpRight size={15} /></a>
        </div>
        <div id="categories" className="category-rail" aria-label="Filtrer par catégorie">
          {categories.map((item) => (
            <button key={item} className="category-chip" type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
              {categoryIcons[item]} {item}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <div className="filter-controls">
            <label className="sr-only" htmlFor="type-filter">Type de produit</label>
            <select id="type-filter" className="filter-select" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="all">Tous les formats</option>
              {productKinds.map((productKind) => <option value={productKind} key={productKind}>{kindLabels[productKind]}</option>)}
            </select>
            <label className="sr-only" htmlFor="sort-filter">Trier les produits</label>
            <select id="sort-filter" className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="featured">Sélection du moment</option>
              <option value="newest">Récemment ajoutés</option>
              <option value="price-asc">Prix le plus bas</option>
            </select>
          </div>
          <span className="results-count" aria-live="polite">{visible.length} création{visible.length > 1 ? "s" : ""}</span>
          {hasFilters && <button className="filter-reset" type="button" onClick={resetFilters}>Effacer les filtres</button>}
        </div>
        {availableTags.length > 0 && <div className="tag-filter-row" aria-label="Filtrer par mot clé">
          <span className="tag-filter-label">Mots clés</span>
          <div className="tag-filter-chips">
            <button className="tag-chip" type="button" aria-pressed={!tag} onClick={() => setTag("")}>Tous</button>
            {availableTags.map((item) => <button key={item} className="tag-chip" type="button" aria-pressed={tag === item} onClick={() => setTag(tag === item ? "" : item)}>#{item}</button>)}
          </div>
        </div>}
        {visible.length ? (
          <div className="product-grid">
            {visible.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="empty-state">
            <h2>{catalogProducts.length ? "Aucun produit ne correspond à votre recherche" : "Les premières créations arrivent"}</h2>
            <p>{catalogProducts.length ? "Essayez un autre mot clé ou retirez un filtre pour élargir votre recherche." : "Vous avez une ressource, un cours ou un produit à partager ? Ouvrez votre boutique et publiez votre première création."}</p>
            {catalogProducts.length ? <button className="button button-light" type="button" onClick={resetFilters}>Réinitialiser les filtres</button> : <Link className="button button-dark" href="/inscription">{brandCopy.createShop} <ArrowRight size={16} /></Link>}
          </div>
        )}
      </section>

      <section className="tagline-section" aria-label="Notre idée">
        <div className="tagline-inner">
          <WordReveal text="Des ressources pour vos projets. Une boutique pour vos créations." />
          <p className="tagline-caption">Apprenez auprès d’indépendants et donnez une place à ce que vous créez.</p>
        </div>
      </section>

      <section className="section-shell creator-promo" id="createurs">
        <div className="creator-promo-card">
          <div className="creator-promo-copy">
            <p className="page-eyebrow">Pour les créateurs</p>
            <h2>Votre savoir et vos créations ont leur boutique.</h2>
            <p>Présentez vos produits, organisez vos cours et proposez du contenu à vos membres. Suivez vos ventes et demandez vos retraits depuis votre espace créateur.</p>
            <Link className="button button-dark" href="/inscription">{brandCopy.createShop} <ArrowRight size={17} /></Link>
          </div>
          <div className="creator-promo-art" aria-hidden="true">
            <div className="promo-card promo-card-one"><p>VOTRE BOUTIQUE</p><strong>Votre savoir.<br />Vos produits.</strong><span>Présentez ce que vous créez</span><b className="promo-mark">✳</b></div>
            <div className="promo-card promo-card-two"><p>VOTRE PROCHAIN PROJET</p><strong>Apprenez.<br />Passez à l’action.</strong><span>Trouvez la ressource utile</span><b className="promo-mark">↗</b></div>
          </div>
        </div>
      </section>

      <section className="section-shell how-section" aria-labelledby="how-title">
        <div className="section-heading"><div><p className="page-eyebrow">Côté acheteur</p><h2 id="how-title">De la découverte à votre prochain projet</h2></div></div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><h3>Explorez les produits</h3><p>Recherchez par catégorie, format ou mot clé pour trouver ce qui répond à votre besoin.</p></article>
          <article className="step-card"><span className="step-number">02</span><h3>Choisissez votre création</h3><p>Consultez la fiche, découvrez le créateur et vérifiez ce qui est inclus avant de commander.</p></article>
          <article className="step-card"><span className="step-number">03</span><h3>Retrouvez vos achats</h3><p>{liveMode ? "Après confirmation du paiement, téléchargez vos ressources ou suivez vos cours depuis votre bibliothèque. Les envois et prestations sont organisés par le créateur." : "Testez l’achat simulé et retrouvez vos contenus de démonstration dans la bibliothèque de ce navigateur."}</p></article>
        </div>
        <div className="section-heading creator-steps-heading"><div><p className="page-eyebrow">Côté créateur</p><h2>De votre première fiche à vos ventes</h2></div></div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><h3>Préparez votre produit</h3><p>Choisissez un format, ajoutez vos contenus et présentez clairement ce que votre client recevra.</p></article>
          <article className="step-card"><span className="step-number">02</span><h3>Publiez et partagez</h3><p>Fixez votre prix, publiez votre fiche et partagez le lien de votre boutique avec votre public.</p></article>
          <article className="step-card"><span className="step-number">03</span><h3>Suivez vos ventes</h3><p>{liveMode ? "Consultez vos ventes confirmées, votre solde et vos frais, puis demandez un retrait. Les versements sont traités manuellement après examen." : "Explorez le tableau de bord avec des commandes simulées. Aucun revenu ni versement réel n’est généré."}</p></article>
        </div>
      </section>

      <section className="section-shell faq-section" aria-labelledby="faq-title">
        <div className="faq-grid">
          <div className="faq-intro"><p className="page-eyebrow">Acheter et vendre sur Sellow</p><h2 id="faq-title">Vos questions, nos réponses</h2><p>{liveMode ? "Les informations utiles pour choisir un produit, ouvrir votre boutique et comprendre les paiements." : "Explorez les parcours avec des achats simulés. Aucun paiement ni versement réel n’est effectué."}</p></div>
          <div className="faq-list">
            <details><summary>Quels produits sont disponibles sur Sellow ?</summary><p>Des fichiers numériques à télécharger, des cours à suivre à son rythme, des abonnements à du contenu, des objets physiques et des services proposés par des créateurs indépendants.</p></details>
            <details><summary>Comment retrouver mes achats ?</summary><p>{liveMode ? "Utilisez le compte qui a réalisé l’achat et ouvrez votre bibliothèque. Vous y retrouvez vos commandes et les contenus auxquels vous avez accès." : "Les achats simulés sont enregistrés dans ce navigateur. Ouvrez la bibliothèque et utilisez l’adresse e mail saisie lors de la démonstration."}</p></details>
            <details><summary>Comment accéder aux fichiers et aux cours ?</summary><p>{liveMode ? "Après confirmation du paiement, ouvrez votre bibliothèque pour télécharger les fichiers ou accéder aux leçons incluses dans votre achat." : "La bibliothèque permet d’explorer les contenus et les fichiers d’exemple des produits de démonstration."}</p></details>
            <details><summary>Comment fonctionne un abonnement ?</summary><p>{liveMode ? `${membershipCopy.renewal} Vous accédez aux publications et aux cours inclus pendant la période payée. L’annulation conserve cet accès jusqu’à son échéance.` : "L’achat simulé ouvre un espace membre de démonstration. Son annulation ferme cet accès immédiatement. Aucun prélèvement réel n’a lieu."}</p></details>
            <details><summary>Qui organise les livraisons et les services ?</summary><p>Le créateur prépare l’envoi de l’objet ou organise la prestation directement avec son client, selon les modalités indiquées sur la fiche produit.</p></details>
            <details><summary>Comment se déroule le paiement ?</summary><p>{liveMode ? `${paymentCopy.introduction} Les contenus sont ouverts après vérification du paiement.` : "Le parcours de démonstration simule une commande. Aucun moyen de paiement ni coordonnée bancaire n’est demandé."}</p></details>
            <details><summary>Comment ouvrir ma boutique ?</summary><p>Créez votre compte, ajoutez votre premier produit et préparez sa présentation. Vous pouvez enregistrer un brouillon avant de publier et de partager votre boutique.</p></details>
            <details><summary>Quels frais sont prélevés sur mes ventes ?</summary><p>{commissionCopy}{!liveMode && " Ces règles concernent les ventes réelles. La démonstration ne prélève aucun frais."}</p></details>
            <details><summary>Comment recevoir mes revenus ?</summary><p>{liveMode ? "Votre espace créateur affiche le solde disponible après commission et frais de traitement. Demandez un retrait avec vos coordonnées mobile money. Le montant est réservé pendant l’examen, puis versé manuellement après approbation." : "Les ventes et retraits réels ne sont pas disponibles en démonstration. Les commandes simulées ne génèrent aucun revenu."}</p></details>
          </div>
        </div>
      </section>
      {!liveMode && <div className="toast-demo" role="note"><i /> Parcours de démonstration</div>}
    </>
  );
}
