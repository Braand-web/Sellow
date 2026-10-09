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

Les tests navigateur désactivent le cache disque de Turbopack sur leur serveur local. Si l’espace disque est limité, `SELLOW_DISABLE_DISK_CACHE=true` désactive aussi ce cache pour une compilation ou un serveur de développement. Cette option ne change pas le fonctionnement de l’application ; le cache reste activé par défaut en production.

## Messagerie clients–vendeurs

`/messages` regroupe les échanges privés : un fil par client et vendeur. Le client ouvre le fil depuis un produit publié, une boutique ou une commande confirmée de son compte. La messagerie n’ajoute aucune étape au checkout. Une session d’achat invité seule ne suffit pas : son adresse doit d’abord être vérifiée.

Appliquez `supabase/migrations/20261009055957_private_messaging.sql`. Cette migration crée les tables protégées par RLS, les RPC réservées au serveur, le bucket privé `message-files` et les publications Realtime. Les écritures ne sont jamais autorisées directement aux clients. Le serveur prend l’identité dans `Auth.getUser()`, contrôle les références et valide les signatures des fichiers avant leur rattachement. Les téléchargements sont autorisés par identifiant et signés pour 60 secondes. Les fichiers abandonnés sont nettoyés après 24 heures.

Déployez la fonction `message-notifications` avec `--no-verify-jwt`, puis exécutez `supabase/messaging-cron.sql`. La fonction vérifie `EMAIL_WORKER_SECRET` avant toute action. Elle réutilise `RESEND_API_KEY`, le domaine vérifié et les secrets Vault `sellow_project_url` / `sellow_email_worker_secret` du worker de reçus. L’expéditeur est `Sellow <messages@notifications.sellow.fun>`. Un appel protégé avec `{ "action": "check-delivery", "testId": "UUID" }` teste cet expéditeur vers la boîte de simulation fixe de Resend, sans envoyer de message à un client.

Après vérification, définissez `MESSAGING_ENABLED=true` dans Vercel et redéployez. Pour fermer temporairement les nouveaux échanges, remettez cette variable à `false` et redéployez ; l’historique reste conservé. Si nécessaire, suspendez séparément la tâche Cron `sellow-message-notifications`. Le mode local conserve les échanges et fichiers dans IndexedDB et n’envoie pas d’e-mails.

Les alertes attendent cinq minutes sans lecture et sont regroupées, avec au maximum une alerte toutes les quinze minutes par conversation et destinataire. Une lecture, un blocage ou une désactivation des e-mails annule les alertes en attente. Les messages effectivement visibles ont des accusés de lecture individuels ; ouvrir la dernière page ne marque pas les anciennes pages comme lues. Les reprises réseau réutilisent le même identifiant de message et la même clé d’envoi e-mail. Les achats affichés sont limités au client vérifié et au vendeur du fil ; les acquisitions gratuites, remboursements et démonstrations ne sont pas comptés comme ventes payées actives.
