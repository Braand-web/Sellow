import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function registerDemoCreator(page: import("@playwright/test").Page, email: string, name = "Mina Créatrice") {
  await page.goto("/inscription");
  await page.getByLabel("Nom affiché").fill(name);
  await page.getByLabel("Adresse e mail").fill(email);
  await page.getByLabel("Mot de passe").fill("Motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/studio$/);
}

async function mockYouTubePlayer(page: Page) {
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "" }));
  await page.addInitScript(() => {
    class MockPlayer {
      state = 2;
      time = 0;
      volume = 75;
      rate = 1;
      constructor(_iframe: HTMLIFrameElement, private options: { events: { onReady: (event: { target: MockPlayer }) => void; onStateChange: (event: { data: number; target: MockPlayer }) => void } }) {
        queueMicrotask(() => this.options.events.onReady({ target: this }));
      }
      playVideo() { this.state = 1; this.time = 17; this.options.events.onStateChange({ data: 1, target: this }); }
      pauseVideo() { this.state = 2; this.options.events.onStateChange({ data: 2, target: this }); }
      seekTo(seconds: number) { this.time = seconds; }
      getCurrentTime() { return this.time; }
      getDuration() { return 120; }
      getVolume() { return this.volume; }
      setVolume(value: number) { this.volume = value; }
      isMuted() { return this.volume === 0; }
      mute() { this.volume = 0; }
      unMute() { this.volume = 75; }
      getAvailablePlaybackRates() { return [1, 1.25, 1.5]; }
      setPlaybackRate(value: number) { this.rate = value; }
      getPlayerState() { return this.state; }
      destroy() {
        const testWindow = window as unknown as { videoMockStats?: { youtubeDestroyed: number } };
        testWindow.videoMockStats ??= { youtubeDestroyed: 0 };
        testWindow.videoMockStats.youtubeDestroyed += 1;
      }
    }
    (window as unknown as { YT?: unknown }).YT = { Player: MockPlayer };
  });
}

async function mockVimeoPlayer(page: Page) {
  await page.route("https://player.vimeo.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "" }));
  await page.addInitScript(() => {
    type Listener = (data?: unknown) => void;
    class MockPlayer {
      time = 0;
      volume = 0.75;
      rate = 1;
      listeners = new Map<string, Listener[]>();
      supportsRates = true;
      constructor(iframe: HTMLIFrameElement) {
        this.supportsRates = !iframe.src.includes("76979872");
        const testWindow = window as unknown as { videoMockInstances?: MockPlayer[] };
        testWindow.videoMockInstances ??= [];
        testWindow.videoMockInstances.push(this);
      }
      ready() { return Promise.resolve(); }
      on(event: string, listener: Listener) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); }
      off(event: string, listener: Listener) { this.listeners.set(event, (this.listeners.get(event) ?? []).filter((item) => item !== listener)); }
      emit(event: string, data?: unknown) { (this.listeners.get(event) ?? []).forEach((listener) => listener(data)); }
      play() { this.time = 23; this.emit("play"); this.emit("timeupdate", { seconds: this.time, duration: 95 }); return Promise.resolve(); }
      pause() { this.emit("pause"); return Promise.resolve(); }
      setCurrentTime(value: number) { this.time = value; return Promise.resolve(value); }
      getCurrentTime() { return Promise.resolve(this.time); }
      getDuration() { return Promise.resolve(95); }
      getVolume() { return Promise.resolve(this.volume); }
      setVolume(value: number) { this.volume = value; this.emit("volumechange", { volume: value }); return Promise.resolve(value); }
      getPlaybackRate() { return Promise.resolve(this.rate); }
      setPlaybackRate(value: number) {
        if (!this.supportsRates && value !== 1) return Promise.reject(new Error("Vitesse indisponible"));
        this.rate = value;
        return Promise.resolve(value);
      }
      getTextTracks() { return Promise.resolve([{ label: "Français", language: "fr", kind: "subtitles", mode: "disabled" }]); }
      enableTextTrack(language: string, kind?: string) { return Promise.resolve({ language, kind }); }
      disableTextTrack() { return Promise.resolve(); }
      destroy() { return Promise.resolve(); }
    }
    (window as unknown as { Vimeo?: unknown }).Vimeo = { Player: MockPlayer };
  });
}

test("combine recherche, catégorie, type et tag puis effacer les filtres", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Rechercher dans les produits").fill("croquis");
  await page.getByRole("button", { name: "Design" }).click();
  await page.getByLabel("Type de produit").selectOption("course");
  await page.getByRole("button", { name: "#figma" }).click();
  await expect(page.locator(".product-card-title")).toHaveCount(1);
  await expect(page.locator(".product-card-title").first()).toContainText("Figma, du croquis");
  await page.getByLabel("Rechercher dans les produits").fill("aucun-produit-avec-ce-nom");
  await expect(page.getByText("Aucune création pour le moment")).toBeVisible();
  await page.getByRole("button", { name: "Réinitialiser les filtres" }).click();
  await expect(page.locator(".product-card-title")).toHaveCount(10);
});

test("les pages publiques affichent des métadonnées propres au contenu", async ({ page }) => {
  await page.goto("/produits/kit-identite-vivante");
  await expect(page).toHaveTitle(/Le kit d’identité vivante/);
  await page.goto("/createurs/ines-laurent");
  await expect(page).toHaveTitle(/Inès Laurent/);
});

test("l’éditeur enrichit la description, insère une image et explique l’Assistant IA non configuré", async ({ page }) => {
  const email = `editeur-${Date.now()}@exemple.test`;
  await registerDemoCreator(page, email, "Awa Éditrice");
  await page.goto("/studio/nouveau");
  await page.getByLabel("Nom du produit").fill("Description mise en forme");
  await page.getByLabel("Phrase de présentation").fill("Une courte phrase pour présenter ce produit.");

  const description = page.locator('[contenteditable="true"][id="product-description"]');
  await description.fill("Une description riche qui présente clairement ce produit.");
  await description.press("Control+A");
  await page.getByRole("button", { name: "Gras" }).click();
  await expect(description.locator("strong")).toHaveText("Une description riche qui présente clairement ce produit.");
  await description.press("ArrowRight");

  await page.getByRole("button", { name: "Assistant IA" }).click();
  await expect(page.getByText("Un fournisseur d’IA devra être configuré pour activer la rédaction et l’amélioration de ce texte.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rédiger" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Améliorer" })).toBeDisabled();
  await page.getByRole("button", { name: "Fermer l’assistant IA" }).click();

  await page.getByRole("button", { name: "Insérer une image" }).click();
  await page.getByLabel("Téléverser une image").setInputFiles({
    name: "atelier.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmqkAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Insérer", exact: true }).click();
  await expect(description.locator("img")).toHaveCount(1);

  await page.getByRole("button", { name: "Publier le produit" }).click();
  await expect(page.getByRole("heading", { name: "Votre espace créateur" })).toBeVisible();
  await page.getByRole("link", { name: "Voir Description mise en forme" }).click();
  await expect(page.locator(".detail-description strong")).toHaveText("Une description riche qui présente clairement ce produit.");
  await expect(page.locator(".detail-description img")).toHaveAttribute("alt", "");
});

test("le créateur modifie le plan du cours, publie, puis l’acheteur retrouve les leçons", async ({ page }) => {
  await mockYouTubePlayer(page);
  await mockVimeoPlayer(page);
  const email = `cours-${Date.now()}@exemple.test`;
  await registerDemoCreator(page, email);

  await page.goto("/studio/nouveau");
  await page.getByRole("button", { name: /Cours/ }).click();
  await page.getByLabel("Nom du produit").fill("Cours de test créateur");
  await page.getByLabel("Phrase de présentation").fill("Un cours de démonstration éditable.");
  await page.getByRole("textbox", { name: "Description" }).fill("Un cours pratique pour apprendre une méthode simple et la réutiliser sur son prochain projet.");
  await page.getByRole("button", { name: "Enregistrer comme brouillon" }).click();
  await expect(page.getByRole("heading", { name: "Votre espace créateur" })).toBeVisible();
  await page.getByRole("link", { name: "Modifier Cours de test créateur" }).click();
  await page.getByRole("button", { name: "Ajouter un module" }).click();
  await page.getByRole("button", { name: "Ajouter une leçon" }).click();
  await page.getByLabel("Titre de la leçon").fill("Les bases du projet");
  await page.locator('[contenteditable="true"][id^="lesson-text-"]').fill("Choisissez une idée et posez ses premières étapes.");
  await page.locator('input[id^="lesson-video-"]').fill("https://www.youtube.com/watch?v=qy4I7y77gTE");
  await page.getByLabel("Durée (minutes)").fill("14");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await page.getByRole("link", { name: "Modifier Cours de test créateur" }).click();
  await page.locator('input[id^="lesson-title-"]').fill("Les bases améliorées");
  await page.getByRole("button", { name: "Ajouter une leçon" }).click();
  await expect(page.locator('input[id^="lesson-title-"]')).toHaveCount(2);
  await page.locator('input[id^="lesson-title-"]').nth(1).fill("Suite vidéo");
  await page.locator('[contenteditable="true"][id^="lesson-text-"]').nth(1).fill("Une seconde vidéo pour vérifier le changement de source.");
  await page.locator('input[id^="lesson-video-"]').nth(1).fill("https://vimeo.com/76979871");
  await page.getByRole("button", { name: "Ajouter une leçon" }).click();
  await expect(page.locator('input[id^="lesson-title-"]')).toHaveCount(3);
  await page.getByRole("button", { name: /Supprimer la leçon 3/ }).click();
  await expect(page.locator('input[id^="lesson-title-"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await page.getByRole("button", { name: "Publier" }).click();
  await page.getByRole("link", { name: "Voir Cours de test créateur" }).click();
  await expect(page).toHaveTitle(/Cours de test createur/i);
  await page.getByRole("link", { name: "Acheter ce produit" }).click();
  await page.getByLabel("Adresse e mail").fill(email);
  await page.getByLabel(/Je comprends qu’il s’agit/).check();
  await page.getByRole("button", { name: "Confirmer l’achat simulé" }).click();
  await page.getByRole("link", { name: "Ouvrir ma bibliothèque" }).click();
  await page.getByRole("link", { name: "Apprendre" }).click();
  await expect(page.getByRole("heading", { name: "Les bases améliorées" })).toBeVisible();
  await expect(page.getByText("Choisissez une idée et posez ses premières étapes.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Lecteur vidéo : Les bases améliorées" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lire la vidéo" })).toBeVisible();
  await page.getByRole("button", { name: "Lire la vidéo" }).click();
  await expect(page.getByRole("button", { name: "Mettre en pause" })).toBeVisible();
  await expect(page.getByText("0:17 / 2:00")).toBeVisible();
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await expect(page.getByRole("button", { name: "Lire la vidéo" })).toBeVisible();
  await expect(page.getByText("0:17 / 2:00")).toBeVisible();
  await page.getByRole("button", { name: "Lire la vidéo" }).click();
  await page.getByLabel("Vitesse de lecture").selectOption("1.5");
  await page.getByRole("button", { name: "Couper le son" }).click();
  await expect(page.getByRole("button", { name: "Activer le son" })).toBeVisible();
  await page.getByRole("button", { name: "Marquer comme terminée" }).click();
  await expect(page.getByText("Marquée comme terminée")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Marquée comme terminée")).toBeVisible();
  await page.getByRole("button", { name: "Suivante" }).click();
  await expect(page.getByRole("heading", { name: "Suite vidéo" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Lecteur vidéo : Suite vidéo" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { videoMockStats?: { youtubeDestroyed: number } }).videoMockStats?.youtubeDestroyed ?? 0)).toBeGreaterThan(0);
});

test("les publications d’abonnement se créent, se modifient et se suppriment", async ({ page }) => {
  await mockVimeoPlayer(page);
  const email = `membre-${Date.now()}@exemple.test`;
  await registerDemoCreator(page, email, "Nora Créatrice");
  await page.goto("/studio/nouveau");
  await page.getByRole("button", { name: /Abonnement/ }).click();
  await page.getByLabel("Nom du produit").fill("Notes de l’atelier membre");
  await page.getByLabel("Phrase de présentation").fill("Une publication créative chaque mois.");
  await page.getByRole("textbox", { name: "Description" }).fill("Un espace membre avec des notes créatives, des exercices et des références à explorer.");
  await page.getByRole("button", { name: "Enregistrer comme brouillon" }).click();
  await page.getByRole("link", { name: "Modifier Notes de l’atelier membre" }).click();
  await page.getByRole("button", { name: "Ajouter une publication" }).click();
  await page.locator('input[id^="post-title-"]').fill("Publication à conserver");
  await page.locator('[contenteditable="true"][id^="post-body-"]').fill("Un premier texte pour les personnes membres.");
  await page.locator('input[id^="post-video-"]').fill("https://vimeo.com/76979871");
  await page.getByRole("button", { name: "Publier cette publication" }).click();
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await page.getByRole("link", { name: "Modifier Notes de l’atelier membre" }).click();
  await expect(page.locator('input[id^="post-title-"]')).toHaveValue("Publication à conserver");
  await page.locator('input[id^="post-title-"]').fill("Publication mise à jour");
  await page.locator('[contenteditable="true"][id^="post-body-"]').fill("Le contenu a bien été modifié par la créatrice.");
  await page.getByRole("button", { name: "Ajouter une publication" }).click();
  await expect(page.locator('input[id^="post-title-"]')).toHaveCount(2);
  await page.locator('input[id^="post-title-"]').nth(1).fill("Publication sans vitesse");
  await page.locator('[contenteditable="true"][id^="post-body-"]').nth(1).fill("Cette vidéo ne propose pas de réglage de vitesse.");
  await page.locator('input[id^="post-video-"]').nth(1).fill("https://vimeo.com/76979872");
  await page.locator(".publish-post").nth(1).click();
  await page.getByRole("button", { name: "Ajouter une publication" }).click();
  await expect(page.locator('input[id^="post-title-"]')).toHaveCount(3);
  await page.getByRole("button", { name: "Supprimer la publication 3" }).click();
  await expect(page.locator('input[id^="post-title-"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await page.getByRole("button", { name: "Publier" }).click();
  await page.getByRole("link", { name: "Voir Notes de l’atelier membre" }).click();
  await page.getByRole("link", { name: "Choisir cet abonnement" }).click();
  await page.getByLabel(/Je comprends qu’il s’agit/).check();
  await page.getByRole("button", { name: "Activer l’abonnement simulé" }).click();
  await page.getByRole("link", { name: "Ouvrir ma bibliothèque" }).click();
  await page.getByRole("link", { name: "Espace membre" }).click();
  await expect(page.getByRole("heading", { name: "Publication mise à jour" })).toBeVisible();
  await expect(page.getByText("Le contenu a bien été modifié par la créatrice.")).toBeVisible();
  const primaryPost = page.getByRole("group", { name: "Lecteur vidéo : Publication mise à jour" });
  await expect(primaryPost).toBeVisible();
  const rateLimitedPost = page.getByRole("group", { name: "Lecteur vidéo : Publication sans vitesse" });
  await expect(rateLimitedPost).toBeVisible();
  await expect(rateLimitedPost.getByLabel("Vitesse de lecture")).toHaveCount(0);
  await primaryPost.getByRole("button", { name: "Lire la vidéo" }).click();
  await expect(primaryPost.getByRole("button", { name: "Mettre en pause" })).toBeVisible();
  await expect(page.getByText("0:23 / 1:35")).toBeVisible();
  await primaryPost.getByLabel("Vitesse de lecture").selectOption("1.5");
  await primaryPost.getByLabel("Sous-titres").selectOption("0");
  await page.evaluate(() => {
    const testWindow = window as unknown as { videoMockInstances?: Array<{ emit: (event: string) => void }> };
    testWindow.videoMockInstances?.at(-1)?.emit("error");
  });
  await expect(page.locator(".unified-video-error")).toContainText("Cette vidéo ne peut pas être lue pour le moment");
  await expect(page.locator(".unified-video-error")).not.toContainText(/YouTube|Vimeo/i);
});

const demoProducts = [
  { slug: "kit-identite-vivante", kind: "Fichier numérique" },
  { slug: "photo-produit-naturelle", kind: "Cours" },
  { slug: "atelier-du-dimanche", kind: "Abonnement" },
  { slug: "carnet-des-petites-idees", kind: "Objet physique" },
  { slug: "portfolio-qui-raconte", kind: "Service" },
];

for (const { slug, kind } of demoProducts) {
  test(`checkout de démonstration pour ${kind.toLocaleLowerCase("fr-FR")}`, async ({ page }) => {
    await page.goto(`/checkout/${slug}`);
    await page.getByLabel("Adresse e mail").fill(`acheteur-${slug}@exemple.test`);
    if (kind === "Objet physique") await page.getByLabel("Adresse de livraison").fill("10 rue des Tests, Dakar, Sénégal");
    await page.getByLabel(/Je comprends qu’il s’agit/).check();
    await page.getByRole("button", { name: /Confirmer l’achat simulé|Activer l’abonnement simulé/ }).click();
    await expect(page.getByRole("heading", { name: "Votre création est prête." })).toBeVisible();
    await expect(page.getByText("Aucun paiement réel n’a été effectué.")).toBeVisible();
  });
}

test("l’annulation simulée ferme l’accès à l’abonnement", async ({ page }) => {
  const email = "annulation@exemple.test";
  await page.goto("/checkout/atelier-du-dimanche");
  await page.getByLabel("Adresse e mail").fill(email);
  await page.getByLabel(/Je comprends qu’il s’agit/).check();
  await page.getByRole("button", { name: "Activer l’abonnement simulé" }).click();
  await page.getByRole("link", { name: "Ouvrir ma bibliothèque" }).click();
  await page.getByRole("link", { name: "Espace membre" }).click();
  await expect(page.getByRole("heading", { name: "Une idée pour le prochain dimanche" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler l’abonnement simulé" }).click();
  await expect(page.getByRole("heading", { name: "Votre accès est arrivé à son terme" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Une idée pour le prochain dimanche" })).toHaveCount(0);
});

test("les filtres sans résultat sont utilisables au clavier sur mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  await page.getByLabel("Rechercher dans les produits").fill("aucun-resultat-mobile-zz");
  await expect(page.getByText("Aucune création pour le moment")).toBeVisible();
  await expect(page.getByRole("button", { name: "Réinitialiser les filtres" })).toBeVisible();
});

test("les actions de commande Supabase refusent une requête sans session", async ({ page }) => {
  const cancellation = await page.request.post("/api/demo-cancel", { data: { orderId: "00000000-0000-4000-8000-000000000001" } });
  expect(cancellation.status()).toBe(401);
  const download = await page.request.get("/api/files/00000000-0000-4000-8000-000000000001");
  expect(download.status()).toBe(401);
  const fileList = await page.request.get("/api/products/00000000-0000-4000-8000-000000000001/files");
  expect(fileList.status()).toBe(401);
  const fileSave = await page.request.put("/api/products/00000000-0000-4000-8000-000000000001/files", { data: { files: [] } });
  expect(fileSave.status()).toBe(401);
});

test("fichiers multiples, prix barré et favoris se modifient et se rechargent", async ({ page }, testInfo) => {
  const email = `fichiers-${Date.now()}@exemple.test`;
  await registerDemoCreator(page, email);
  await page.goto("/studio/nouveau");
  await page.getByLabel("Nom du produit").fill("Pack ressources multiples");
  await page.getByLabel("Phrase de présentation").fill("Un guide et ses ressources téléchargeables.");
  await page.locator('#product-description[contenteditable="true"]').fill("Le guide et ses bonus, avec plusieurs fichiers privés à télécharger séparément.");
  await page.getByLabel("Prix", { exact:true }).fill("5000");
  await page.getByLabel("Devise").selectOption("XAF");
  await page.getByLabel("Prix barré (facultatif)").fill("25000");
  await page.locator("#product-file").setInputFiles([
    { name:"ressource.txt", mimeType:"text/plain", buffer:Buffer.from("guide-a") },
    { name:"ressource.txt", mimeType:"text/plain", buffer:Buffer.from("bonus-b") },
  ]);
  await page.getByLabel("Nom affiché du fichier 1").fill("Guide complet");
  await page.getByLabel("Nom affiché du fichier 2").fill("Bonus pratique");
  await page.getByRole("button", {name:"Monter le fichier 2"}).click();
  await expect(page.getByLabel("Nom affiché du fichier 1")).toHaveValue("Bonus pratique");
  await page.getByRole("button", {name:"Publier le produit",exact:true}).click();
  await expect(page).toHaveURL(/studio\?created=/);
  await page.getByRole("link", {name:"Voir Pack ressources multiples",exact:true}).click();
  await expect(page).toHaveURL(/produits\/pack-ressources-multiples-/);
  const productUrl = page.url();
  await expect(page.locator(".detail-price")).toHaveText(/5\s*000 FCFA/);
  await expect(page.locator(".detail-content .compare-at-price")).toContainText(/25\s*000 FCFA/);
  await page.getByRole("button", {name:"Enregistrer pour plus tard"}).click();
  await page.goto("/studio");
  await page.getByRole("link", {name:"Modifier Pack ressources multiples"}).click();
  await expect(page.getByLabel("Nom affiché du fichier 1")).toHaveValue("Bonus pratique");
  await expect(page.getByLabel("Prix barré (facultatif)")).toHaveValue("25000");
  await page.getByLabel("Nom affiché du fichier 1").fill("Bonus actualisé");
  await page.getByLabel("Autoriser « Enregistrer pour plus tard »").uncheck();
  await page.locator("#product-file").setInputFiles({name:"checklist.txt",mimeType:"text/plain",buffer:Buffer.from("checklist-c")});
  await page.getByRole("button", {name:"Retirer le fichier 2"}).click();
  await page.getByRole("button", {name:"Enregistrer les modifications"}).click();
  await expect(page).toHaveURL(/studio$/);
  await page.goto(productUrl);
  await page.getByRole("button", {name:"Retirer des favoris",exact:true}).click();
  await expect(page.getByRole("button", {name:"Enregistrer pour plus tard"})).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", {name:"Enregistrer pour plus tard"})).toHaveCount(0);
  await page.goto("/");
  await page.getByLabel("Rechercher dans les produits").fill("Pack ressources multiples");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card .favorite-button")).toHaveCount(0);
  await expect(page.locator(".product-card .compare-at-price")).toHaveText(/25\s*000 FCFA/);
  await page.goto(productUrl);
  await page.getByRole("link", {name:"Acheter ce produit"}).click();
  await expect(page.locator(".checkout-summary")).toContainText(/5\s*000 FCFA/);
  await expect(page.locator(".checkout-summary")).not.toContainText(/25\s*000 FCFA/);
  await page.getByLabel("Adresse e mail").fill(email);
  await page.getByLabel(/Je comprends qu’il s’agit/).check();
  await page.getByRole("button", {name:"Confirmer l’achat simulé"}).click();
  await page.getByRole("link", {name:"Ouvrir ma bibliothèque"}).click();
  await expect(page).toHaveURL(/bibliotheque/);
  await page.reload();
  await expect(page.locator(".library-download-file")).toHaveCount(2);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name:"Télécharger Bonus actualisé",exact:true}).click();
  const download = await downloadPromise;
  await download.saveAs(testInfo.outputPath("bonus.txt"));
  expect(await readFile(testInfo.outputPath("bonus.txt"),"utf8")).toBe("bonus-b");
  const checklistPromise = page.waitForEvent("download");
  await page.getByRole("button", {name:"Télécharger checklist.txt",exact:true}).click();
  const checklist = await checklistPromise;
  await checklist.saveAs(testInfo.outputPath("checklist.txt"));
  expect(await readFile(testInfo.outputPath("checklist.txt"),"utf8")).toBe("checklist-c");
});

test("modèle AIDA éditable, contrôles des prix et formulaire mobile", async ({ page }) => {
  await registerDemoCreator(page, `aida-${Date.now()}@exemple.test`);
  await page.setViewportSize({width:390,height:844});
  await page.goto("/studio/nouveau");
  await page.getByLabel("Nom du produit").fill("Mon guide pratique AIDA");
  await page.getByLabel("Phrase de présentation").fill("Une ressource pour avancer à son rythme.");
  await page.getByRole("button", {name:"Modèle AIDA"}).click();
  const editor = page.locator('#product-description[contenteditable="true"]');
  await expect(editor).toContainText("Ce que vous recevez");
  await expect(editor.locator("h2")).toHaveCount(4);
  await page.getByLabel("Prix barré (facultatif)").fill("5");
  await page.getByRole("button", {name:"Publier le produit",exact:true}).click();
  await expect(page).toHaveURL(/studio\/nouveau/);
  expect(await page.getByLabel("Prix barré (facultatif)").evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
  await page.getByLabel("Prix barré (facultatif)").fill("25");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Autoriser « Enregistrer pour plus tard »").focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Autoriser « Enregistrer pour plus tard »")).not.toBeChecked();
  await page.getByRole("button", {name:"Publier le produit",exact:true}).click();
  await expect(page).toHaveURL(/studio\?created=/);
  await page.getByRole("link", {name:"Modifier Mon guide pratique AIDA"}).click();
  await expect(page.locator('#edit-description[contenteditable="true"] h2')).toHaveCount(4);
  await expect(page.getByLabel("Autoriser « Enregistrer pour plus tard »")).not.toBeChecked();
});

test("un ancien produit à fichier unique conserve son téléchargement local", async ({ page }, testInfo) => {
  await page.goto("/checkout/kit-identite-vivante");
  await page.getByLabel("Adresse e mail").fill("legacy-fichier@exemple.test");
  await page.getByLabel(/Je comprends qu’il s’agit/).check();
  await page.getByRole("button", {name:"Confirmer l’achat simulé"}).click();
  await page.getByRole("link", {name:"Ouvrir ma bibliothèque"}).click();
  await expect(page).toHaveURL(/bibliotheque/);
  await page.reload();
  const event = page.waitForEvent("download");
  await page.getByRole("button", {name:"Télécharger kit-identite-vivante.zip"}).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("kit-identite-vivante.zip");
  await download.saveAs(testInfo.outputPath("legacy.txt"));
  expect(await readFile(testInfo.outputPath("legacy.txt"),"utf8")).toContain("fichier de démonstration");
});
