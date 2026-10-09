import { expect, test, type Page } from "@playwright/test";
import { seedProducts } from "../lib/seed";

const description = Array.from({ length: 12 }, (_, index) => `Partie ${index + 1}. Des ressources pratiques pour avancer dans votre projet, comprendre la méthode et appliquer chaque étape à votre rythme.`).join("\n\n");
const products = seedProducts.map((product) => ({ ...product, description }));
const download = products.find((product) => product.kind === "download")!;
download.price = 5000;
download.currency = "XAF";
download.compareAtPrice = 25000;
download.saveForLaterEnabled = false;
download.cover = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGesAAAAASUVORK5CYII=";
products.push({ ...download, id: "mobile-free", slug: "guide-mobile-gratuit", title: "Guide mobile gratuit", price: 0, compareAtPrice: undefined, saveForLaterEnabled: true });
products.push({ ...download, id: "mobile-unpublished", slug: "guide-mobile-masque", published: false });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((fixtures) => {
    const stats = { active: 0, disconnected: 0 };
    (window as unknown as { purchaseObserverStats: typeof stats }).purchaseObserverStats = stats;
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      tracked = false;
      override observe(target: Element) {
        if (target.matches(".detail-buy-button") && !this.tracked) { this.tracked = true; stats.active += 1; }
        super.observe(target);
      }
      override disconnect() {
        if (this.tracked) { this.tracked = false; stats.active -= 1; stats.disconnected += 1; }
        super.disconnect();
      }
    };
    if (!localStorage.getItem("gumroad-fr-demo-v1")) {
      localStorage.setItem("gumroad-fr-demo-v1", JSON.stringify({ products: fixtures, user: null, orders: [], favorites: [] }));
    }
  }, products);
});

async function scrollPastPurchase(page: Page, visiblePixels = -8) {
  await page.locator(".detail-buy-button").evaluate((button, pixels) => {
    window.scrollTo({ top: window.scrollY + button.getBoundingClientRect().bottom - pixels, behavior: "instant" });
  }, visiblePixels);
}

async function expectPurchaseSpace(page: Page) {
  // Observer callbacks and responsive layout settle asynchronously after scrolling.
  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector('.mobile-purchase-bar');
    return Boolean(bar && Number.parseFloat(getComputedStyle(document.body).paddingBottom) >= bar.getBoundingClientRect().height);
  })).toBe(true);
}

for (const width of [320, 390, 780]) {
  test(`ordre mobile et barre d’achat au défilement à ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/produits/${download.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(download.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator(".detail-cover img")).toBeVisible();
    await expect(page.locator(".detail-cover img")).toHaveAttribute("loading", "eager");
    await expect(page.locator(".detail-cover img")).toHaveAttribute("fetchpriority", "high");
    await expect.poll(() => page.locator(".detail-cover img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const heading = await page.locator(".detail-heading").boundingBox();
    const cover = await page.locator(".detail-cover").boundingBox();
    const purchase = await page.locator(".detail-purchase").boundingBox();
    const body = await page.locator(".detail-body").boundingBox();
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(cover!.y);
    expect(cover!.y + cover!.height).toBeLessThanOrEqual(purchase!.y);
    expect(purchase!.y + purchase!.height).toBeLessThanOrEqual(body!.y);
    await expect(page.locator(".detail-price")).toHaveText(/5\s*000 FCFA/);
    await expect(page.locator(".detail-prices s")).toHaveText(/25\s*000 FCFA/);
    await expect(page.getByRole("button", { name: "Enregistrer pour plus tard" })).toHaveCount(0);
    // In particular at 780px the main button starts below the viewport.
    await expect(page.getByRole("region", { name: "Achat rapide" })).toHaveCount(0);
    const primary = page.locator(".detail-buy-button");
    await primary.scrollIntoViewIfNeeded();
    await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
    await scrollPastPurchase(page, 20);
    await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
    await scrollPastPurchase(page);
    const bar = page.getByRole("region", { name: "Achat rapide" });
    await expect(bar).toBeVisible();
    await expect(bar.locator(".mobile-purchase-price")).toHaveText(/5\s*000 FCFA/);
    await expect(bar.getByRole("link")).toHaveAttribute("href", await primary.getAttribute("href") ?? "");
    expect(await bar.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectPurchaseSpace(page);
    await page.screenshot({ path: testInfo.outputPath(`barre-mobile-${width}.png`) });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(bar).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-mobile-purchase-bar", "true");
    await expect(page.getByRole("link", { name: "Acheter ce produit", exact: true })).toHaveCount(1);
    await scrollPastPurchase(page);
    await expect(bar).toBeVisible();
    const action = bar.getByRole("link");
    await action.focus();
    await expect(action).toBeFocused();
    expect(await action.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`checkout/${download.slug}$`));
    await expect(bar).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-mobile-purchase-bar", "true");
    await expect(page.locator(".checkout-total")).toContainText(/5\s*000 FCFA/);
    await expect(page.locator(".checkout-total")).not.toContainText(/25\s*000/);
    expect(await page.evaluate(() => (window as unknown as { purchaseObserverStats: { active: number } }).purchaseObserverStats.active)).toBe(0);
  });
}

for (const kind of ["download", "course", "membership", "physical", "service"] as const) {
  const product = products.find((item) => item.kind === kind)!;
  const label = kind === "membership" ? "Choisir cet abonnement" : kind === "service" ? "Commander ce service" : "Acheter ce produit";
  test(`la barre reprend le checkout du produit ${kind}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/produits/${product.slug}`);
    await expect(page.locator(".detail-buy-button")).toHaveText(label);
    await scrollPastPurchase(page);
    const bar = page.getByRole("region", { name: "Achat rapide" });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: label })).toHaveAttribute("href", `/checkout/${product.slug}`);
    if (kind === "membership") await expect(bar.locator(".mobile-purchase-price")).toContainText("/ mois");
    await bar.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`checkout/${product.slug}$`));
    await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
  });
}

test("produit gratuit, retrait des favoris conservés et fiche indisponible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/produits/guide-mobile-gratuit");
  await expect(page.locator(".detail-buy-button")).toHaveText("Obtenir le produit");
  await expect(page.locator(".detail-prices s")).toHaveCount(0);
  await scrollPastPurchase(page);
  await expect(page.locator(".mobile-purchase-price")).toContainText("Gratuit");
  await page.goto(`/produits/${download.slug}`);
  await page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem("gumroad-fr-demo-v1")!);
    state.favorites = [id];
    localStorage.setItem("gumroad-fr-demo-v1", JSON.stringify(state));
  }, download.id);
  await page.reload();
  await page.getByRole("button", { name: "Retirer des favoris", exact: true }).click();
  await expect(page.locator(".detail-purchase").getByRole("button", { name: /favoris|Enregistrer pour plus tard/ })).toHaveCount(0);
  await page.goto("/produits/guide-mobile-masque");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ce produit n’est plus disponible.");
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect(page.locator(".mobile-purchase-bar, .detail-buy-button")).toHaveCount(0);
});

test("nettoyage au changement de fiche, de viewport et présentation ordinateur", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/produits/${download.slug}`);
  await scrollPastPurchase(page);
  await expect(page.locator(".mobile-purchase-bar")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-mobile-purchase-bar", "true");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const cover = await page.locator(".detail-cover").boundingBox();
  const sidebar = await page.locator(".detail-content").boundingBox();
  expect(cover!.x + cover!.width).toBeLessThan(sidebar!.x);
  expect(await page.locator(".detail-content").evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await expect(page.locator(".detail-subtitle")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await scrollPastPurchase(page);
  await expect(page.locator(".mobile-purchase-bar")).toBeVisible();
  const nextProduct = page.locator(".related-section .product-card-title").first();
  const nextHref = await nextProduct.getAttribute("href");
  await nextProduct.click();
  await expect(page).toHaveURL(new RegExp(`${nextHref}$`));
  await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
  const stats = await page.evaluate(() => (window as unknown as { purchaseObserverStats: { active: number; disconnected: number } }).purchaseObserverStats);
  expect(stats.active).toBe(1);
  expect(stats.disconnected).toBeGreaterThan(0);
  await page.goto("/produits/photo-produit-naturelle");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Photo produit naturelle");
  await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
  await scrollPastPurchase(page);
  await expect(page.locator(".mobile-purchase-bar a")).toHaveAttribute("href", "/checkout/photo-produit-naturelle");
});

test("la barre laisse de la place aux notifications et au bas de la page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`/produits/${download.slug}`);
  await scrollPastPurchase(page);
  await expect(page.locator(".mobile-purchase-bar")).toBeVisible();
  await expectPurchaseSpace(page);
  // Simulate the global notification surface to check its responsive placement.
  await page.evaluate(() => {
    const notice = document.createElement("div");
    notice.className = "toast-message";
    notice.textContent = "Les modifications ont été enregistrées.";
    document.body.append(notice);
  });
  const notice = await page.locator(".toast-message").boundingBox();
  const bar = await page.locator(".mobile-purchase-bar").boundingBox();
  expect(notice!.y + notice!.height).toBeLessThan(bar!.y);
  expect(notice!.x).toBeGreaterThanOrEqual(0);
  expect(notice!.x + notice!.width).toBeLessThanOrEqual(320);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  const footer = await page.locator(".footer-bottom").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(bar!.y);
});
