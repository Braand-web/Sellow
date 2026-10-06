"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, MagnifyingGlass, Storefront } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { useMarketplace } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useMarketplace();
  const [query, setQuery] = useState("");

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/?q=${encodeURIComponent(query.trim())}#decouvrir`);
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Sellow, accueil">
          <BrandMark />
          <span>Sellow</span>
        </Link>
        <nav className="main-nav" aria-label="Navigation principale">
          <Link className={pathname === "/" ? "nav-active" : ""} href="/#decouvrir">Découvrir</Link>
          <Link className={pathname.startsWith("/createurs") ? "nav-active" : ""} href="/#createurs">Créateurs</Link>
        </nav>
        <form className="header-search" role="search" onSubmit={search}>
          <MagnifyingGlass size={17} aria-hidden="true" />
          <input
            aria-label="Rechercher un produit"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un produit"
          />
          <kbd>⌘ K</kbd>
        </form>
        <div className="header-actions">
          {user ? (
            <>
              <Link className="header-library" href="/bibliotheque">Ma bibliothèque</Link>
              <Link className="header-avatar" href="/studio" aria-label={`Ouvrir l’espace de ${user.name}`}>
                <span className="avatar avatar-rose">{user.initials}</span>
              </Link>
            </>
          ) : (
            <Link className="header-login" href={`/connexion?next=${encodeURIComponent(pathname === "/" ? "/studio" : pathname)}`}>
              Se connecter
            </Link>
          )}
          <Link className="button button-dark button-small header-cta" href={user ? "/studio/nouveau" : "/inscription"}>
            <Storefront size={16} weight="bold" />
            <span>Commencer à vendre</span>
            <ArrowRight className="button-arrow" size={15} />
          </Link>
        </div>
      </div>
      <div className="header-mobile-search">
        <form className="header-search" role="search" onSubmit={search}>
          <MagnifyingGlass size={17} aria-hidden="true" />
          <input aria-label="Rechercher un produit" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un produit" />
        </form>
      </div>
    </header>
  );
}
