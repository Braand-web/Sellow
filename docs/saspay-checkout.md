# Vérification des frais SasPay

Les checkouts Sellow demandent `fee_charge_mode: DEDUCTED`. Le réglage par défaut
du marchand FlowPay est indépendant : l'autorisation d'override API doit être active.

Une réponse vide ne prouve ni un mode incompatible ni une dette du créateur.
Sellow consulte le détail de la session lorsque la création ne confirme pas le
mode. Toute session réutilisée est relue. La redirection exige un mode Déduits
confirmé, une session en attente et une URL du checkout officiel.

La vérification du 7 octobre 2026 a confirmé que l'API live enveloppe ses réponses
dans `{ success: true, data: …, code: … }`. Le client extrait `data` avant de lire
la session ou la transaction. Les réponses directes montrées par la documentation
restent compatibles. Une enveloppe d'échec est refusée, même avec un HTTP 200.
L'API live renvoie le checkout sur `https://checkout.saspay.me/<slug>` ; le format
documenté `https://pay.saspay.me/checkout/<slug>` reste accepté. Les autres origines
et les URL contenant des identifiants sont refusées.

Les références et résultats sont conservés dans les champs existants des commandes.
Les logs `saspay.checkout_check` contiennent uniquement les identifiants, les états
et les résultats du contrôle, sans clé API ni données client. Le checkout n'accorde
aucun accès : la confirmation du paiement et le webhook restent nécessaires.

## Diagnostic opérationnel

Dans un environnement serveur contenant `SASPAY_API_KEY`, activer explicitement
`SASPAY_VALIDATE_CHECKOUT=true`, puis lancer `npm run payment:diagnose`.
Sans cette variable, le script ne crée aucune session.

Le diagnostic crée une seule session technique de 12 EUR avec une adresse fictive,
vérifie son mode puis l'annule. Il ne crée aucune commande Sellow et ne réalise
aucun paiement. Le log `SASPAY_CHECKOUT_VALIDATION` est prévu pour le support.
Le script échoue si le mode Déduits ou l'annulation n'est pas confirmé.

## Si le mode reste inconnu

Conserver le blocage temporaire. Préparer pour SasPay les identifiants de session,
les états `creationFeeMode`, `detailFeeMode`, `detailResult`, le montant et la devise
du diagnostic, avec la confirmation que l'override est actif. Demander pourquoi
la création ou le détail ne confirme pas `DEDUCTED` malgré la demande explicite.
Ne joindre aucune clé ni donnée client. Ne pas changer le réglage global de FlowPay
pour contourner une réponse non confirmée.
