# Sellow

Marketplace responsive de découverte et de vente de créations indépendantes. Le mode local utilise un checkout simulé sans mouvement d’argent. Le checkout SasPay réel est disponible uniquement lorsque la configuration serveur et la migration Supabase sont en place.

## Lancer le prototype

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`. Sans configuration, les comptes, favoris, produits et commandes de démonstration sont conservés dans le navigateur utilisé.

## Activer Supabase

1. Copiez `.env.example` vers `.env.local`.
2. Renseignez `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`.
3. Pour une nouvelle base, exécutez `supabase/schema.sql` dans l’éditeur SQL Supabase. Pour une base déjà utilisée, appliquez les migrations dans l’ordre chronologique, notamment `supabase/migrations/20261006215200_saspay_checkout_and_payouts.sql`.
4. Configurez l’inscription par e mail dans Supabase Auth.

La clé `SUPABASE_SERVICE_ROLE_KEY` reste côté serveur. Ne lui donnez jamais le préfixe `NEXT_PUBLIC_`. Les achats de produits Supabase demandent un compte connecté et créent une commande `paid_demo` associée à son acheteur. Les téléchargements et annulations vérifient la session et la propriété de la commande avant d’agir.

Les programmes, textes, vidéos et ressources de cours sont conservés séparément des fiches visibles dans le catalogue. Les aperçus gratuits ne renvoient que les leçons marquées comme aperçu. La migration recopie les anciennes leçons dans un premier module et retire les anciens contenus membres des fiches publiques.

## Déployer sur Vercel

Connectez le compte Vercel, puis lancez `npx vercel --prod` depuis ce dossier. Les achats du mode local restent stockés dans le navigateur. Pour partager des comptes et du contenu entre appareils, configurez d’abord les variables Supabase dans les paramètres du projet Vercel et appliquez le schéma ou la migration ci-dessus.

## Paiements

Le mode local utilise `DemoPaymentProvider`. Le checkout réel est isolé derrière `HostedPaymentProvider` et `SasPayPaymentProvider`; la clé API et le secret webhook restent côté serveur. Pour activer SasPay, configurez `PAYMENT_MODE=saspay`, `NEXT_PUBLIC_PAYMENT_MODE=saspay`, `SASPAY_API_KEY`, `SASPAY_WEBHOOK_SECRET` et `NEXT_PUBLIC_APP_URL` dans l’environnement Vercel. Ajoutez l’adresse d’administration dans `SELLOW_ADMIN_EMAILS` (liste d’adresses séparées par des virgules). Créez une clé marchand FlowPay limitée au PAYIN. Le compte doit autoriser le mode de frais par checkout et renvoyer explicitement `DEDUCTED`; sinon Sellow refuse le checkout.

Dans SasPay, configurez le webhook de production vers `https://sellow.fun/api/webhooks/saspay` avec les événements `transaction.success`, `transaction.failed` et `transaction.cancelled`, puis enregistrez le secret de signature comme `SASPAY_WEBHOOK_SECRET`. Les commandes ne donnent accès au contenu qu’après vérification serveur du paiement auprès de SasPay. Sellow applique 10 % de commission, puis 5 % aux commandes créées après 5 000 $ de ventes réussies cumulées, converties au taux Frankfurter archivé avec chaque commande. Les frais SasPay en mode `DEDUCTED` sont suivis séparément.

Les créateurs voient leurs soldes et demandent un retrait mobile money dans `/studio/retraits`. L’administration des demandes est réservée aux emails de `SELLOW_ADMIN_EMAILS`; les versements sont exécutés manuellement depuis SasPay et leur référence est enregistrée dans Sellow. Les abonnements sont renouvelés manuellement chaque mois et l’annulation conserve l’accès jusqu’à l’échéance.

Sans SasPay configuré, les commandes restent simulées et ne déclenchent aucun paiement réel.

## Tests

Installez le navigateur Chromium de Playwright une première fois, puis lancez les tests unitaires et les parcours navigateur :

```bash
npx playwright install chromium
npm run test
```
