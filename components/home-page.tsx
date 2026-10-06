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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tout");
  const [kind, setKind] = useState("all");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("featured");

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
    const filtered = products.filter((product) => {
      if (!product.published) return false;
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
  }, [category, kind, products, query, sort, tag]);

  const availableTags = useMemo(
    () => [...new Set(products.filter((product) => product.published).flatMap((product) => product.tags))].sort((a, b) => a.localeCompare(b, "fr")),
    [products],
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

  const heroProducts = products.slice(0, 3);

  return (
    <>
      <div id="haut" className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> Le marché des idées indépendantes</p>
          <h1>Trouvez des ressources utiles <span>créées par des indépendants.</span></h1>
          <p className="hero-description">Des outils, des cours et des objets faits avec soin pour donner vie à votre prochain projet.</p>
          <form className="hero-search" role="search" onSubmit={submitSearch}>
            <label>
              <MagnifyingGlass size={20} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que souhaitez-vous trouver ?" aria-label="Rechercher dans les produits" />
            </label>
            <button className="button button-dark" type="submit">Explorer <ArrowRight size={17} /></button>
          </form>
          <p className="hero-proof"><strong>Fichiers, cours et abonnements</strong> · Une sélection créée par des personnes indépendantes</p>
        </div>
        <div className="hero-art" aria-label="Sélection de créations Sellow">
          <div className="hero-art-circle" />
          {heroProducts[1] && <div className="floating-cover floating-cover-left"><ProductCover product={heroProducts[1]} compact /></div>}
          {heroProducts[2] && <div className="floating-cover floating-cover-right"><ProductCover product={heroProducts[2]} compact /></div>}
          {heroProducts[0] && <div className="floating-cover floating-cover-main"><ProductCover product={heroProducts[0]} compact /></div>}
          <span className="hero-sticker">FAIT PAR<br />DES GENS</span>
          <span className="hero-caption">De nouvelles idées, chaque semaine <ArrowDownRight size={14} /></span>
        </div>
      </div>

      <section className="section-shell market-section" id="decouvrir" aria-labelledby="discover-title">
        <div className="section-heading">
          <div><p className="page-eyebrow">Choisissez votre prochaine idée</p><h2 id="discover-title">Les découvertes du moment</h2><p>Des créations originales, choisies par celles et ceux qui les font.</p></div>
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
            <h2>Aucune création pour le moment</h2>
            <p>Essayez un autre mot ou retirez un filtre pour découvrir plus de produits.</p>
            <button className="button button-light" type="button" onClick={resetFilters}>Réinitialiser les filtres</button>
          </div>
        )}
      </section>

      <section className="tagline-section" aria-label="Notre idée">
        <div className="tagline-inner">
          <WordReveal text="Tout ce qu’il vous faut pour faire avancer votre prochaine idée." />
          <p className="tagline-caption">Des outils concrets, des savoir faire partagés et des objets pensés par leurs créateurs.</p>
        </div>
      </section>

      <section className="section-shell creator-promo" id="createurs">
        <div className="creator-promo-card">
          <div className="creator-promo-copy">
            <p className="page-eyebrow">Pour les créateurs</p>
            <h2>Votre prochaine idée mérite sa place.</h2>
            <p>Créez votre page, partagez votre travail et gardez le lien avec les personnes qui le soutiennent.</p>
            <Link className="button button-dark" href="/inscription">Commencer à vendre <ArrowRight size={17} /></Link>
          </div>
          <div className="creator-promo-art" aria-hidden="true">
            <div className="promo-card promo-card-one"><p>UNE PAGE À VOUS</p><strong>Faites place<br />à vos idées.</strong><span>Créée par Clara Nsimba</span><b className="promo-mark">✳</b></div>
            <div className="promo-card promo-card-two"><p>VOTRE PROCHAIN PROJET</p><strong>Le début<br />de quelque chose.</strong><span>Un produit à votre image</span><b className="promo-mark">↗</b></div>
          </div>
        </div>
      </section>

      <section className="section-shell how-section" aria-labelledby="how-title">
        <div className="section-heading"><div><p className="page-eyebrow">C’est simple</p><h2 id="how-title">Une bonne idée, trois étapes</h2></div></div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><h3>Trouvez ce qui vous parle</h3><p>Parcourez les catégories ou cherchez un outil, un cours ou une création précise.</p></article>
          <article className="step-card"><span className="step-number">02</span><h3>Découvrez la personne derrière</h3><p>Chaque page vous présente le produit et le créateur qui l’a imaginé.</p></article>
          <article className="step-card"><span className="step-number">03</span><h3>Gardez votre découverte</h3><p>Les achats de démonstration apparaissent dans votre bibliothèque sur cet appareil.</p></article>
        </div>
      </section>

      <section className="section-shell faq-section" aria-labelledby="faq-title">
        <div className="faq-grid">
          <div className="faq-intro"><p className="page-eyebrow">Quelques réponses</p><h2 id="faq-title">Avant de vous lancer</h2><p>Les achats sur ce site sont simulés. Aucun paiement ni versement n’est effectué.</p></div>
          <div className="faq-list">
            <details><summary>Quels produits puis je trouver ici ?</summary><p>Des fichiers numériques, des cours, des abonnements, des objets physiques et des services proposés par des créateurs.</p></details>
            <details><summary>Comment retrouver un achat de démonstration ?</summary><p>Connectez vous avec la même adresse e mail puis ouvrez votre bibliothèque. Les achats sont enregistrés dans le navigateur utilisé pour la démonstration.</p></details>
            <details><summary>Les produits numériques sont ils vraiment téléchargés ?</summary><p>Les produits de démonstration donnent accès à un reçu et à un fichier d’exemple. Le stockage privé réel se branche avec votre projet Supabase.</p></details>
            <details><summary>Comment se passe un abonnement ?</summary><p>Le checkout de démonstration active un accès mensuel simulé. Aucun renouvellement ni prélèvement réel ne sera déclenché.</p></details>
            <details><summary>Qui organise les envois et les services ?</summary><p>Le créateur gère lui même l’expédition d’un objet ou la réalisation d’un service après la commande.</p></details>
            <details><summary>Quand les paiements seront ils disponibles ?</summary><p>Le parcours actuel est une démonstration. Un prestataire de paiement africain devra être choisi et configuré avant toute transaction réelle.</p></details>
          </div>
        </div>
      </section>
      <div className="toast-demo" role="note"><i /> Parcours de démonstration</div>
    </>
  );
}
