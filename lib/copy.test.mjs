import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { brandCopy, checkoutConfirmation, commissionCopy, membershipCopy, paymentCopy, publicErrorMessage } from "./copy.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const providerName = /\bsaspay\b/i;

test("shared copy uses Sellow branding and explains costs and manual renewals", () => {
  assert.equal(brandCopy.headline, "Découvrez des créations. Vendez les vôtres.");
  assert.equal(paymentCopy.continue, "Continuer vers le paiement");
  assert.match(commissionCopy, /10 %.*5 %.*5 000 \$/);
  assert.match(commissionCopy, /prix brut.*déduits séparément/);
  assert.match(membershipCopy.renewal, /manuel.*sans prélèvement automatique/);
  assert.match(membershipCopy.cancellation, /jusqu’à la fin de la période payée/);
  assert.doesNotMatch(JSON.stringify({ brandCopy, paymentCopy, membershipCopy, commissionCopy }), providerName);
});

test("technical errors never expose provider names, internal configuration or URLs", () => {
  for (const error of ["SasPay n’a pas accepté la demande.", new Error("Supabase service_role missing"), "https://api.saspay.me/failed", "SASPAY_API_KEY absent", "relation products missing from schema", "fetch failed", null, "", "x".repeat(401)]) {
    assert.equal(publicErrorMessage(error, paymentCopy.unavailable), paymentCopy.unavailable);
  }
  assert.equal(publicErrorMessage("Ajoutez une adresse de livraison."), "Ajoutez une adresse de livraison.");
});

test("confirmations match all five formats and do not promise demo shipments or services", () => {
  for (const kind of ["download", "course", "membership", "physical", "service"]) {
    assert.doesNotMatch(JSON.stringify(checkoutConfirmation(kind)), providerName);
    assert.ok(checkoutConfirmation(kind).title);
  }
  assert.match(checkoutConfirmation("download").description, /télécharger/);
  assert.match(checkoutConfirmation("course").description, /rythme/);
  assert.match(checkoutConfirmation("membership").description, /publications/);
  assert.match(checkoutConfirmation("physical", true).description, /Aucun colis/);
  assert.match(checkoutConfirmation("service", true).description, /simulée/);
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

test("UI, accessible labels, metadata and API error literals contain no provider branding", () => {
  const violations = [];
  for (const file of [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components"))]) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function inspect(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
        const value = node.text.trim();
        // Provider configuration and route identifiers are technical API contracts.
        if (!ts.isImportDeclaration(node.parent) && /\b(saspay|supabase)\b/i.test(value) && !/^(saspay$|@\/|\/api\/|https:\/\/|saspay\.)/i.test(value)) violations.push(`${file}: ${value}`);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  assert.deepEqual(violations, []);
});

// Render the actual components with account/payment fixtures. No service calls
// or credentials are needed, and hook fixtures cover post-payment branches.
function renderScreen(file, exportName, { live = false, marketplace = {}, params = {}, states = {} } = {}) {
  const previousMode = process.env.NEXT_PUBLIC_PAYMENT_MODE;
  process.env.NEXT_PUBLIC_PAYMENT_MODE = live ? "saspay" : "demo";
  let hookIndex = 0;
  const state = { products: [], orders: [], user: null, ready: true, favorites: [], supabaseConfigured: false, ...marketplace };
  const link = ({ children, ...props }) => {
    delete props.scroll;
    delete props.prefetch;
    return React.createElement("a", props, children);
  };
  const dependencies = {
    react: { ...React, useState: (initial) => { const index = hookIndex++; return [Object.hasOwn(states, index) ? states[index] : typeof initial === "function" ? initial() : initial, () => {}]; }, useEffect: () => {}, useMemo: (fn) => fn(), useCallback: (fn) => fn() },
    "next/link": { default: link, __esModule: true },
    "next/navigation": { useParams: () => params, useRouter: () => ({}), usePathname: () => "/" },
    "@/app/providers": { useMarketplace: () => state, MarketplaceProvider: ({ children }) => children },
    "@/components/product-cover": { ProductCover: () => React.createElement("div", { className: "product-cover" }) },
    "@/components/product-card": { ProductCard: ({ product }) => React.createElement("article", null, product.title), formatPrice: (price) => `${price} €` },
    "@/components/word-reveal": { WordReveal: ({ text }) => React.createElement("p", null, text) },
    "@/components/rich-text-content": { RichTextContent: () => null },
    "@/components/brand-mark": { BrandMark: () => null },
    "@/components/video-player": { VideoPlayer: () => null },
  };
  const iconExports = new Proxy({}, { get: () => () => null });
  const cache = new Map();
  function load(name) {
    if (dependencies[name]) return dependencies[name];
    if (name.startsWith("@phosphor-icons/")) return iconExports;
    if (name.startsWith("@/")) {
      const base = join(root, name.slice(2));
      if (base.endsWith(".mjs")) return require(base);
      const target = [base + ".tsx", base + ".ts"].find((candidate) => { try { readFileSync(candidate); return true; } catch { return false; } });
      if (!target) throw new Error(`Missing module ${name}`);
      return compile(target);
    }
    return require(name);
  }
  function compile(target) {
    if (cache.has(target)) return cache.get(target);
    const compiledModule = { exports: {} };
    cache.set(target, compiledModule.exports);
    const compiled = ts.transpileModule(readFileSync(target, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function("require", "module", "exports", compiled)(load, compiledModule, compiledModule.exports);
    cache.set(target, compiledModule.exports);
    return compiledModule.exports;
  }
  try { return renderToStaticMarkup(React.createElement(compile(join(root, file))[exportName])); }
  finally { if (previousMode === undefined) delete process.env.NEXT_PUBLIC_PAYMENT_MODE; else process.env.NEXT_PUBLIC_PAYMENT_MODE = previousMode; }
}

const buyer = { id: "buyer", email: "buyer@example.com", name: "Mina", slug: "mina", initials: "MI", isDemo: false };
const product = { id: "product", slug: "produit", title: "Création test", creatorName: "Aïcha", category: "Design", kind: "download", price: 12, currency: "EUR", published: true, isRemote: true, tags: [], creatorSlug: "aicha", details: {} };

test("home supports both audiences and distinguishes an empty catalogue from no results", () => {
  const html = renderScreen("components/home-page.tsx", "HomePage", { live: true });
  assert.match(html, /Découvrez des créations/);
  assert.match(html, /Vendez les vôtres/);
  assert.match(html, /Les premières créations arrivent/);
  assert.match(html, /Côté acheteur/);
  assert.match(html, /Côté créateur/);
  const filtered = renderScreen("components/home-page.tsx", "HomePage", { marketplace: { products: [product] }, states: { 0: "introuvable" } });
  assert.match(filtered, /Aucun produit ne correspond/);
  assert.doesNotMatch(html + filtered, providerName);
});

test("actual checkout renders neutral real/demo copy for all formats", () => {
  for (const live of [false, true]) for (const kind of ["download", "course", "membership", "physical", "service"]) {
    const html = renderScreen("components/checkout-page.tsx", "CheckoutPage", { live, params: { slug: product.slug }, marketplace: { products: [{ ...product, kind }], user: buyer } });
    assert.doesNotMatch(html, providerName);
    assert.match(html, live ? /Continuer vers le paiement|Payer l’accès du mois/ : /simulé/);
    if (live && kind === "membership") assert.match(html, /sans prélèvement automatique/);
    if (kind === "physical") assert.match(html, /Adresse de livraison/);
  }
});

test("actual checkout success, pending, failed and canceled branches keep neutral branding", () => {
  for (const status of ["paid", "pending", "failed", "canceled"]) {
    const html = renderScreen("components/checkout-page.tsx", "CheckoutPage", { live: true, params: { slug: product.slug }, marketplace: { products: [product], user: buyer }, states: { 7: { id: "order", status, isRemote: true, amount: 12, currency: "EUR" } } });
    assert.doesNotMatch(html, providerName);
    assert.match(html, status === "paid" ? /Paiement confirmé/ : status === "pending" ? /Nous vérifions votre paiement/ : /Le paiement n’a pas été confirmé/);
  }
});

test("library distinguishes account purchases from browser-only demonstration data", () => {
  const remote = renderScreen("components/library-page.tsx", "LibraryPage", { marketplace: { user: buyer, supabaseConfigured: true } });
  const demo = renderScreen("components/library-page.tsx", "LibraryPage");
  assert.match(remote, /associés à votre compte/);
  assert.doesNotMatch(remote, /achetés sur cet appareil|Supabase/);
  assert.match(demo, /navigateur utilisé pour la démonstration/);
});

test("guest confirmations use the order snapshot after unpublishing and expose no content action", () => {
  for (const productKind of ["download", "course", "membership", "physical", "service"]) {
    const html = renderScreen("components/checkout-page.tsx", "CheckoutPage", { live: true, params: { slug: "removed-product" }, states: { 7: { id: "order", status: "paid", isRemote: true, amount: 12, currency: "EUR", productKind, productTitle: "Mon achat", buyerEmail: "buyer@example.com", requiresEmailVerification: true } } });
    assert.match(html, /Paiement confirmé/);
    assert.match(html, /Vérifiez votre adresse e-mail/);
    assert.match(html, /Mon achat/);
    assert.doesNotMatch(html, /Ce produit n’est plus disponible|Télécharger mes fichiers|Commencer le cours|Ouvrir mon espace membre/);
  }
});

test("a visitor on the real payment site sees account sign-in instead of demonstration purchases", () => {
  const html = renderScreen("components/library-page.tsx", "LibraryPage", { live: true, marketplace: { supabaseConfigured: true } });
  assert.match(html, /Connectez-vous pour retrouver vos achats/);
  assert.match(html, /connexion\?next=%2Fbibliotheque/);
  assert.doesNotMatch(html, /achats simulés|commandes de démonstration|SasPay|Supabase/);
});

test("footer, legal and creator/admin payment screens render without provider branding", () => {
  for (const live of [false, true]) for (const [file, component] of [["components/site-footer.tsx", "SiteFooter"], ["components/dashboard-page.tsx", "DashboardPage"], ["components/payout-dashboard-page.tsx", "PayoutDashboardPage"], ["app/conditions/page.tsx", "default"], ["app/confidentialite/page.tsx", "default"]]) {
    const html = renderScreen(file, component, { live, marketplace: { user: { ...buyer, isDemo: !live }, supabaseConnected: live }, states: file.includes("payout-dashboard") && live ? { 0: [{ currency: "EUR", gross: 100, commission: 10, processorFees: 2, available: 88, reserved: 0 }], 2: [{ id: "withdrawal", status: "approved", amount: 20, currency: "EUR", createdAt: "2026-10-07T12:00:00Z" }] } : {} });
    assert.doesNotMatch(html, /\b(SasPay|Supabase)\b/i);
    if (file.includes("payout-dashboard") && live) {
      assert.match(html, /Frais de traitement/);
      assert.match(html, /Référence du versement/);
    }
  }
});
