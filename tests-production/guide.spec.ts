import { expect, test } from "@playwright/test";

for (const [name, width, height] of [["ordinateur",1440,1000],["mobile",390,844]] as const) {
  test(`guide publié : page, images, métadonnées et checkout sur ${name}`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height});
    await page.goto("/produits/le-plan-500k-afrique");
    await expect(page).toHaveTitle(/Le Plan 500K Afrique.*Bleuebrand/);
    await expect(page.getByRole("heading",{level:1,name:"Le Plan 500K Afrique",exact:true})).toBeVisible();
    await expect(page.locator(".detail-price")).toHaveText(/5\s*000 FCFA/);
    await expect(page.locator(".detail-content .compare-at-price")).toContainText(/25\s*000 FCFA/);
    await expect(page.getByRole("button",{name:"Enregistrer pour plus tard"})).toBeVisible();
    await expect(page.locator(".detail-description img")).toHaveCount(3);
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
    await page.getByRole("link",{name:"Acheter ce produit"}).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/checkout\/le-plan-500k-afrique/);
    await expect(page.locator(".checkout-total")).toHaveText(/Montant5\s*000 FCFA/);
    await expect(page.getByRole("heading",{name:"Connectez-vous pour continuer"})).toBeVisible();
  });
}

test("les fichiers privés et le checkout refusent une session absente en production", async ({request}) => {
  const files = await request.get("/api/products/9ca287cd-db6d-42ed-8057-42ae6ff84d99/files");
  expect(files.status()).toBe(401);
  const save = await request.put("/api/products/9ca287cd-db6d-42ed-8057-42ae6ff84d99/files",{data:{files:[]}});
  expect(save.status()).toBe(401);
  const download = await request.get("/api/files/00000000-0000-4000-8000-000000000001?fileId=00000000-0000-4000-8000-000000000001");
  expect(download.status()).toBe(401);
  const checkout = await request.post("/api/checkout",{data:{slug:"le-plan-500k-afrique",buyerEmail:"guest@example.test",idempotencyKey:"00000000-0000-4000-8000-000000000001"}});
  expect(checkout.status()).toBe(401);
});
