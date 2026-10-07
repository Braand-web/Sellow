import { expect, test } from "@playwright/test";

test("recovery uses email then code, handles expiration and navigates after verification", async ({ page }) => {
  let requests = 0;
  let attempts = 0;
  await page.route("**/api/auth/otp/request", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({ email: "buyer@example.com" });
    await route.fulfill({ json: { message: "Si l’adresse peut recevoir nos e-mails, un code vous sera envoyé.", retryAfter: 60 } });
  });
  await page.route("**/api/auth/otp/verify", async (route) => {
    attempts++;
    await route.fulfill(attempts === 1 ? { status: 400, json: { error: "Ce code est incorrect ou a expiré. Demandez un nouveau code." } } : { json: { next: "/bibliotheque" } });
  });
  await page.goto("/achats/retrouver");
  await page.getByLabel("Adresse e-mail de l’achat").fill("buyer@example.com");
  await page.getByLabel("Adresse e-mail de l’achat").press("Enter");
  await expect(page.getByLabel("Code reçu par e-mail")).toBeVisible();
  await expect(page.getByRole("button", { name: /Renvoyer le code dans/ })).toBeDisabled();
  await expect(page.getByLabel("Adresse e-mail de l’achat")).toHaveAttribute("readonly", "");
  await page.getByLabel("Code reçu par e-mail").fill("000000");
  await page.getByLabel("Code reçu par e-mail").press("Enter");
  await expect(page.locator(".email-access-form").getByRole("alert")).toContainText("incorrect ou a expiré");
  await page.getByLabel("Code reçu par e-mail").fill("123456");
  await page.getByRole("button", { name: "Accéder à mes achats" }).click();
  await expect(page).toHaveURL(/bibliotheque$/);
  expect(requests).toBe(1);
});
test("mobile recovery stays usable and exposes a neutral email outage", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/auth/otp/request", (route) => route.fulfill({ status: 503, json: { error: "La connexion par e-mail est temporairement indisponible." } }));
  await page.goto("/achats/retrouver?commande=10000000-0000-4000-8000-000000000001");
  await page.getByLabel("Adresse e-mail de l’achat").fill("buyer@example.com");
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.locator(".email-access-form").getByRole("alert")).toContainText("temporairement indisponible");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "Utiliser mon mot de passe" })).toBeVisible();
});
