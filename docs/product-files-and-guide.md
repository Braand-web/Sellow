# Fichiers multiples et options de vente

Les formulaires de création et de modification proposent le prix barré, le réglage « Enregistrer pour plus tard » et, pour les fichiers numériques, une liste de ressources privées. Le nombre de fichiers n’a pas de plafond dans Sellow ; le fournisseur de stockage applique ses limites de taille et de quota.

Chaque fichier a un UUID indépendant de son nom. On peut sélectionner plusieurs fichiers homonymes, modifier leur nom d’affichage et réordonner la liste. Retirer un fichier de la liste retire sa référence du produit ; les blobs restent privés pour préserver les liens temporaires déjà émis. Leur suppression définitive peut être effectuée après vérification des références dans Storage.

## Protection et compatibilité

- `product_files` est protégé par RLS : propriétaire du produit ou acheteur ayant une commande confirmée et un droit actif.
- `/api/products/[productId]/files` vérifie la session serveur. GET renvoie uniquement le manifeste sans chemins de stockage ; PUT est réservé au propriétaire.
- `replace_product_files` remplace le manifeste dans une transaction, vérifie la propriété et la présence des nouveaux objets dans le bucket privé. Seul `service_role` peut appeler cette fonction.
- `/api/files/[orderId]?fileId=UUID` vérifie l’identité de l’acheteur, la commande, l’accès actif et l’appartenance du fichier au produit. Le lien signé expire après 90 secondes.
- L’ancien endpoint sans `fileId` reste fonctionnel. La migration ajoute les références historiques sans déplacer leurs blobs.
- Les fichiers locaux sont dans IndexedDB. Les manifestes Supabase ne sont pas enregistrés dans localStorage et sont rechargés après un changement de compte.
- Le checkout utilise toujours `products.amount`, jamais `compare_at_amount`. Le contrôle SasPay `DEDUCTED` reste obligatoire.

## Migration appliquée à Sellow

`supabase/migrations/20261007072243_product_files_and_sale_options.sql` a été appliquée au projet `phcsrjmnlecrwfduailm` via le Management API du CLI Supabase. Ce projet ne disposait pas de table `supabase_migrations.schema_migrations` ; son historique précédent était déjà géré par scripts SQL.

## Publication du guide

Le script `scripts/publish-plan-500k.mjs` cherche exactement `bleuebrand@gmail.com`, exige son profil créateur et refuse de créer un compte de remplacement. Il réutilise le slug `le-plan-500k-afrique` pour éviter les doublons et vérifie les prix, la visibilité publique du produit et la confidentialité du PDF.

Les images publiques sont dans `product-rich-images`. Le PDF complet est exclusivement dans `product-files`. Les visuels et le PDF de préparation sont dans `private-import/`, exclu de Git et des déploiements Vercel. Les aperçus publiés correspondent aux pages 2 et 17 du PDF.

Pour une publication manuelle, configurer les identifiants serveur dans un fichier `.env.sellow.local` ignoré, préparer les fichiers dans `private-import/plan-500k-afrique`, puis exécuter :

```powershell
node --env-file=.env.sellow.local scripts/publish-plan-500k.mjs
```

Ne pas ajouter ce script au build automatique : une relance explicite réécrit la description initiale du guide. Les changements ultérieurs du vendeur passent par l’éditeur du studio.

## Vérifications

`npm run test` comprend les tests des manifestes, des prix, des favoris, des téléchargements avec clients Supabase simulés, une exécution de la migration dans PostgreSQL avec PGlite, ainsi que les parcours Playwright de création, édition et achat local.
