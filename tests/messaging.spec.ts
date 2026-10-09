import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email: string, next = "/messages") {
  await page.goto(`/connexion?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Adresse e mail").fill(email);
  await page.getByLabel("Mot de passe").fill("Motdepasse123");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/messages/);
}
async function logout(page: Page) {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/$/);
}
test("before purchase: login destination, one thread, seller reply, blocking, private attachments and reload", async ({
  page,
}) => {
  await page.goto("/produits/kit-identite-vivante");
  await page.getByRole("link", { name: "Contacter le vendeur" }).click();
  await expect(page).toHaveURL(/connexion\?next=/);
  await page
    .getByRole("link", { name: "Créer un compte", exact: true })
    .click();
  await expect(page).toHaveURL(/inscription\?next=/);
  await login(
    page,
    "acheteur@example.test",
    "/messages?produit=seed-kit-marque",
  );
  await expect(
    page.getByRole("heading", { name: "Inès Laurent", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Bonjour, le fichier est-il modifiable ?");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.locator(".message-bubble")).toHaveCount(1);
  const conversation = page.url().split("?")[0];
  await page.reload();
  await expect(
    page
      .locator(".message-log")
      .getByText("Bonjour, le fichier est-il modifiable ?", { exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "notice.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nTest"),
  });
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /notice.pdf.*Ouvrir le fichier/ }),
  ).toBeVisible();
  await expect(page.locator(".message-bubble")).toHaveCount(2);
  await logout(page);
  await login(page, "ines@example.test");
  await expect(
    page.getByRole("link", { name: /Acheteur.*Prospect/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Messages, 2 non lus/ }),
  ).toBeVisible();
  await page.locator(".conversation-row").click();
  await expect(
    page
      .locator(".message-log")
      .getByText("Bonjour, le fichier est-il modifiable ?", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".messages-purchases .customer-badge")).toHaveText(
    "Prospect",
  );
  await expect(
    page.getByRole("link", { name: /Messages, \d+ non lus/ }),
  ).toHaveCount(0);
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Oui, vous pouvez personnaliser les modèles.");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.locator(".message-bubble")).toHaveCount(3);
  await page.getByLabel("Alertes par e-mail").uncheck();
  await expect(page.getByLabel("Alertes par e-mail")).not.toBeChecked();
  await page
    .getByRole("button", { name: "Bloquer les nouveaux messages" })
    .click();
  await expect(
    page.getByText(
      "Les nouveaux messages sont bloqués. L’historique reste disponible.",
    ),
  ).toBeVisible();
  await logout(page);
  await login(page, "acheteur@example.test");
  await page.locator(".conversation-row").click();
  await expect(
    page
      .locator(".message-log")
      .getByText("Oui, vous pouvez personnaliser les modèles.", {
        exact: true,
      }),
  ).toBeVisible();
  await expect(page.getByLabel("Votre message", { exact: true })).toHaveCount(
    0,
  );
  await logout(page);
  await login(
    page,
    "ines@example.test",
    conversation.replace(/https?:\/\/[^/]+/, ""),
  );
  await page
    .locator(".message-blocked")
    .getByRole("button", { name: "Débloquer mes échanges" })
    .click();
  await expect(page.getByLabel("Votre message", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Alertes par e-mail")).not.toBeChecked();
  await logout(page);
  await login(
    page,
    "autre@example.test",
    conversation.replace(/https?:\/\/[^/]+/, ""),
  );
  await expect(page.locator(".messages-page").getByRole("alert")).toContainText(
    "Cette discussion n’est pas accessible",
  );
  await expect(
    page
      .locator(".message-log")
      .getByText("Bonjour, le fichier est-il modifiable ?", { exact: true }),
  ).toHaveCount(0);
});
test("after a demo purchase: explicit demo label, product context and mobile views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "mobile@example.test", "/messages?produit=seed-kit-marque");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Question sur mon achat");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await page.goto("/checkout/kit-identite-vivante");
  await page.getByLabel("Adresse e mail").fill("mobile@example.test");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmer l’achat simulé" }).click();
  await page.getByRole("link", { name: "Contacter le vendeur" }).click();
  await expect(page.locator(".conversation-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Achats", exact: true }).click();
  await expect(
    page.getByText("Démonstration · Aucun paiement réel", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Merci pour la ressource");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.locator(".message-context").last()).toContainText(
    "Commande",
  );
  await page.getByRole("button", { name: "Discussions", exact: true }).click();
  await expect(page.locator(".messages-list")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator(".conversation-row").click();
  await page.getByLabel("Votre message", { exact: true }).focus();
  await page.keyboard.type("Envoi au clavier");
  await page.keyboard.press("Control+Enter");
  await expect(
    page.getByText("Envoi au clavier", { exact: true }),
  ).toBeVisible();
});
