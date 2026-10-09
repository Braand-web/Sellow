import { expect, test } from "@playwright/test";

for (const [name, width, height] of [["ordinateur",1440,1000],["mobile",390,844]] as const) {
  test(`guide publié : page, images, métadonnées et checkout sur ${name}`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height});
    await page.goto("/produits/le-plan-500k-afrique");
    await expect(page).toHaveTitle(/Le Plan 500K Afrique.*Bleuebrand/);
    await expect(page.getByRole("heading",{level:1,name:"Le Plan 500K Afrique",exact:true})).toBeVisible();
    await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
    await expect(page.locator(".detail-price")).toHaveText(/5\s*000 FCFA/);
    await expect(page.locator(".detail-content .compare-at-price")).toContainText(/25\s*000 FCFA/);
    await expect(page.getByRole("button",{name:"Enregistrer pour plus tard"})).toBeVisible();
    await expect(page.locator(".detail-description img")).toHaveCount(3);
    await expect(page.locator(".detail-cover img")).toHaveAttribute("loading","eager");
    await expect.poll(() => page.locator(".detail-cover img").evaluate((image:HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    if (width <= 780) {
      const heading = await page.locator(".detail-heading").boundingBox();
      const cover = await page.locator(".detail-cover").boundingBox();
      const purchase = await page.locator(".detail-purchase").boundingBox();
      const body = await page.locator(".detail-body").boundingBox();
      expect(heading!.y + heading!.height).toBeLessThanOrEqual(cover!.y);
      expect(cover!.y + cover!.height).toBeLessThanOrEqual(purchase!.y);
      expect(purchase!.y + purchase!.height).toBeLessThanOrEqual(body!.y);
      await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
      await page.locator(".detail-buy-button").evaluate((button) => window.scrollTo({top:window.scrollY + button.getBoundingClientRect().bottom + 8,behavior:"instant"}));
      await expect(page.getByRole("region",{name:"Achat rapide"})).toBeVisible();
      await expect(page.locator(".mobile-purchase-price")).toContainText(/5\s*000 FCFA/);
      await expect(page.locator(".mobile-purchase-bar a")).toHaveAttribute("href","/checkout/le-plan-500k-afrique");
      await page.screenshot({path:testInfo.outputPath("guide-mobile-bouton-fixe.png")});
      await page.evaluate(() => window.scrollTo({top:0,behavior:"instant"}));
      await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
      await page.screenshot({path:testInfo.outputPath("guide-mobile-debut.png")});
    }
    const images = page.locator(".detail-description img, .detail-cover img");
    for (let index=0;index<await images.count();index++) {
      await images.nth(index).scrollIntoViewIfNeeded();
      await expect.poll(() => images.nth(index).evaluate((image:HTMLImageElement) => image.complete && image.naturalWidth > 0), {timeout:20000,message:"L’image publique doit être chargée et décodable"}).toBe(true);
    }
    await expect(page.locator(".detail-description")).toContainText("objectif de chiffre d’affaires brut avant dépenses");
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toContain("Afrique francophone");
    expect(description?.length).toBeLessThanOrEqual(180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`guide-${name}.png`),fullPage:true});
    await page.locator(".detail-buy-button").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/checkout\/le-plan-500k-afrique/);
    await expect(page.locator(".checkout-total")).toHaveText(/Montant5\s*000 FCFA/);
    await expect(page.getByRole("heading",{name:"Finalisez votre achat"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Connectez-vous pour continuer"})).toHaveCount(0);
    const email = page.getByLabel("Adresse e mail",{exact:true});
    await expect(email).toBeVisible();
    await expect(email).toBeEditable();
    await expect(page.getByRole("link",{name:"Déjà client ? Se connecter"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Continuer vers le paiement"})).toBeVisible();
    await email.focus();
    await expect(email).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`checkout-invite-${name}.png`),fullPage:true});
  });
}

test("aucun bouton d’achat réel sur une fiche de démonstration", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/produits/kit-identite-vivante");
  await expect(page.getByRole("heading",{level:1})).toBeVisible();
  await expect(page.locator(".detail-buy-button")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({top:document.body.scrollHeight,behavior:"instant"}));
  await expect(page.locator(".mobile-purchase-bar")).toHaveCount(0);
});

test("les fichiers privés refusent les visiteurs et le checkout invité exige une adresse valide", async ({request}) => {
  const files = await request.get("/api/products/9ca287cd-db6d-42ed-8057-42ae6ff84d99/files");
  expect(files.status()).toBe(401);
  const save = await request.put("/api/products/9ca287cd-db6d-42ed-8057-42ae6ff84d99/files",{data:{files:[]}});
  expect(save.status()).toBe(401);
  const download = await request.get("/api/files/00000000-0000-4000-8000-000000000001?fileId=00000000-0000-4000-8000-000000000001");
  expect(download.status()).toBe(401);
  for (const buyerEmail of [undefined,"adresse-invalide"]) {
    const checkout = await request.post("/api/checkout",{data:{slug:"le-plan-500k-afrique",buyerEmail,idempotencyKey:"00000000-0000-4000-8000-000000000001"}});
    expect(checkout.status()).toBe(400);
    const body = await checkout.json();
    expect(body.checkoutUrl).toBeUndefined();
    expect(body.order).toBeUndefined();
  }
});

for (const [name,width,height] of [["ordinateur",1440,1000],["mobile",390,844]] as const) {
  test(`récupération des achats par code disponible sur ${name}`, async ({page},testInfo) => {
    await page.setViewportSize({width,height});
    await page.goto("/achats/retrouver");
    await expect(page.getByRole("heading",{name:"Retrouvez vos achats"})).toBeVisible();
    const email = page.getByLabel("Adresse e-mail de l’achat",{exact:true});
    await expect(email).toBeEditable();
    await expect(page.getByRole("button",{name:"Recevoir mon code"})).toBeEnabled();
    await expect(page.getByRole("link",{name:"Utiliser mon mot de passe"})).toBeVisible();
    await email.focus();
    await expect(email).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`recuperation-${name}.png`),fullPage:true});
  });
}
