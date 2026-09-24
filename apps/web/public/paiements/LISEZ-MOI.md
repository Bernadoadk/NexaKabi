# Logos des moyens de paiement

Un fichier par moyen, nommé d'après le champ `logo` de `PAYMENT_METHOD_DEFINITIONS`
(`packages/contracts/src/payments.ts`) — jamais d'après le prestataire qui le traite. Changer
d'agrégateur ne doit toucher aucun de ces fichiers.

## Ce que sont ces fichiers aujourd'hui

Des **marques de substitution** : la couleur officielle de chaque opérateur et son nom, dans un
format carré de 64 × 64 arrondi, cohérent avec le design system. Ils remplissent leur rôle —
l'acheteur reconnaît le jaune MTN et l'orange d'Orange avant même de lire — mais ce **ne sont pas
les logos officiels**.

## Avant la mise en production

Les logos des opérateurs sont des **marques déposées**. Leur usage suppose :

- de récupérer les fichiers dans la charte officielle de chaque opérateur, ou auprès du prestataire
  de paiement (Kkiapay) qui les fournit parfois à ses marchands ;
- de respecter leurs contraintes d'usage — zone de protection, proportions, fonds admis ;
- de vérifier que notre relation commerciale autorise l'affichage de la marque.

Le remplacement ne demande aucun changement de code : déposer le fichier sous le même nom suffit.
Garder le format carré, un fond opaque et un tracé lisible à 40 px de côté — c'est la taille
d'affichage dans le tunnel d'achat.

## Repli

Un moyen sans fichier — le virement bancaire — s'affiche avec une pastille
typographique tirée de `brandColor`. L'écran ne casse jamais faute de logo.
