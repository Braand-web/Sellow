# Achat invité et connexion par code

## Activation

Les paramètres serveur `GUEST_CHECKOUT_ENABLED` et `EMAIL_OTP_ENABLED` doivent être `true` pour ouvrir un nouveau checkout invité. Les laisser à `false` conserve la connexion préalable. Le suivi et le rattachement d’une commande invitée existante restent possibles lorsque seul le premier paramètre est désactivé.

1. Appliquer `supabase/migrations/20261007120448_guest_checkout_email_access.sql` au projet Sellow.
2. Vérifier `notifications.sellow.fun` dans Resend avec les enregistrements fournis par son dashboard. Préserver les DNS du site web et les autres expéditeurs.
3. Créer une clé Resend réservée à l’envoi depuis ce domaine. La conserver exclusivement dans Supabase et les environnements serveur.
4. Configurer le SMTP personnalisé Supabase : hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe correspondant à la clé. Expéditeur `Sellow`, adresse `connexion@notifications.sellow.fun`.
5. Dans Auth, configurer une expiration du code de 600 secondes et un intervalle minimum d’envoi de 60 secondes. Les modèles « Magic Link » et « Confirm signup » doivent afficher `{{ .Token }}` pour les comptes existants et nouveaux. Conserver la confirmation d’e-mail obligatoire. La connexion par mot de passe continue de fonctionner.
6. Déployer `purchase-emails`, avec `RESEND_API_KEY`, `EMAIL_WORKER_SECRET`, `SELLOW_APP_URL=https://sellow.fun` et `RESEND_RECEIPT_FROM=Sellow <achats@notifications.sellow.fun>` dans les secrets de la fonction. L’endpoint refuse les appels sans secret valide, même si la vérification JWT de la passerelle est désactivée.
7. Stocker l’URL du projet et le secret de worker dans Vault sous `sellow_project_url` et `sellow_email_worker_secret`. Exécuter `supabase/setup-email-worker.sql` pour programmer la file chaque minute.
8. Vérifier un reçu de configuration et un code réellement reçus sur l’adresse propriétaire, puis leur validation. Activer les deux paramètres dans Vercel et déployer.

La limite native Supabase par IP s’applique aussi au serveur qui demande les codes ; tous les clients servis par la même instance peuvent donc partager le quota par IP. Pour un trafic plus important, configurer le transfert d’IP avec une clé secrète moderne, selon la documentation Supabase, plutôt que désactiver les limites.

## Accès et données

- Le cookie `sellow_checkout` contient un secret aléatoire valable sept jours ; seule son empreinte SHA-256 est stockée. Il autorise uniquement le suivi et la vérification de ses commandes.
- Une commande payée invitée n’accorde aucun contenu avant une validation OTP effective. Le RPC de rattachement est réservé au serveur ; les rôles publics ne peuvent pas l’appeler.
- Les commandes et droits sont rattachés dans une transaction, une seule fois. Les périodes d’abonnement restent fondées sur les paiements, jamais sur la date de vérification.
- Les erreurs d’envoi ne modifient pas un paiement confirmé. La file utilise des leases, six tentatives au maximum et une clé d’idempotence stable pour chaque reçu. Le fournisseur conserve ces clés pendant sa fenêtre d’idempotence ; une relance manuelle ancienne nécessite de vérifier ses journaux pour éviter un doublon après une réponse incertaine.
- `/studio/administration/emails` est réservé à la liste serveur `SELLOW_ADMIN_EMAILS`. Une correction exige la référence exacte de la transaction, une commande invitée payée non rattachée et aucun envoi en cours. Chaque correction est auditée et crée une nouvelle révision du reçu.

## Vérification

`npm run lint`, `npm run build` et `npm run test` couvrent les données PostgreSQL dans PGlite, les handlers avec services simulés, la file e-mail et l’interface Playwright. PGlite utilise une connexion exclusive : ces tests ne remplacent pas un test de charge avec transactions concurrentes sur le projet réel. Les tests automatiques ne déplacent aucun argent et n’envoient aucun e-mail réel.
