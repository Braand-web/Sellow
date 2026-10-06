# Gumroad en français

Prototype responsive de découverte et de vente de créations indépendantes. Le checkout est une simulation : il ne demande aucune donnée bancaire et ne déclenche aucun paiement ni reversement.

## Lancer le prototype

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`. Sans configuration, les comptes, favoris, produits et commandes de démonstration sont conservés dans le navigateur utilisé.

## Activer Supabase

1. Copiez `.env.example` vers `.env.local`.
2. Renseignez `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`.
3. Pour une nouvelle base, exécutez `supabase/schema.sql` dans l’éditeur SQL Supabase. Pour une base déjà utilisée par l’application, exécutez uniquement `supabase/migrations/20261004114331_private_course_content.sql`.
4. Configurez l’inscription par e mail dans Supabase Auth.

La clé `SUPABASE_SERVICE_ROLE_KEY` reste côté serveur. Ne lui donnez jamais le préfixe `NEXT_PUBLIC_`. Les achats de produits Supabase demandent un compte connecté et créent une commande `paid_demo` associée à son acheteur. Les téléchargements et annulations vérifient la session et la propriété de la commande avant d’agir.

Les programmes, textes, vidéos et ressources de cours sont conservés séparément des fiches visibles dans le catalogue. Les aperçus gratuits ne renvoient que les leçons marquées comme aperçu. La migration recopie les anciennes leçons dans un premier module et retire les anciens contenus membres des fiches publiques.

## Déployer sur Vercel

Connectez le compte Vercel, puis lancez `npx vercel --prod` depuis ce dossier. Les achats du mode local restent stockés dans le navigateur. Pour partager des comptes et du contenu entre appareils, configurez d’abord les variables Supabase dans les paramètres du projet Vercel et appliquez le schéma ou la migration ci-dessus.

## Paiements

`lib/payment/provider.ts` contient le contrat `PaymentProvider` et son implémentation `DemoPaymentProvider`. Le futur prestataire de paiement devra remplacer cet adaptateur et vérifier les commandes côté serveur. En production, laissez `DEMO_CHECKOUT_ENABLED` vide ou à `false` pour désactiver les routes de démonstration.

Les revenus et commandes affichés dans le prototype sont fictifs. Le prestataire africain n’est pas encore connecté.

## Tests

Installez le navigateur Chromium de Playwright une première fois, puis lancez les tests unitaires et les parcours navigateur :

```bash
npx playwright install chromium
npm run test
```
