# Prestataire de paiement — Kkiapay

> **Décision du 23 septembre 2026.** KPay est abandonné ; **Kkiapay** (compte « Intégration ») est
> le seul prestataire actif. KPay n'avait jamais encaissé : aucune clé posée, aucun paiement en base.
> Son code, ses variables et ses lignes de configuration ont été retirés. Bictorys reste **hérité**
> (relecture et remboursement de son historique seulement).

Sources, relues le 23 septembre 2026 : documentation officielle (<https://docs.kkiapay.me/v1/>,
en Markdown via `/v1/llms.txt`), FAQ et Tarifs (<https://kkiapay.me>), et le code des SDK
officiels (<https://github.com/kkiapay/nodejs-sdk>, <https://github.com/kkiapay/php-sdk>, paquet
npm `kkiapay`). **Les pages de documentation ne donnent pas les adresses d'API** : seuls les SDK
serveur les portent. Tout ce qui n'est confirmé ni par l'une ni par les autres est listé au §9.

---

## 1. Ce que Kkiapay fait — et ce qu'il ne fait pas

| Capacité | Kkiapay | Dans Nexa-Kabi |
| -------- | ------- | -------------- |
| Mobile Money | ✅ MTN, Moov (page « Méthodes de paiement ») ; la FAQ cite aussi Celtiis, Orange, Free, T-Money, Wave | MTN MoMo et Moov Money ouverts au Bénin ; Celtiis créé **fermé** ; les autres se configurent dans la console une fois constatés sur le compte |
| Carte | ✅ Visa, Mastercard | Ouverte au Bénin |
| Devise | XOF seulement | `currencies: ['XOF']` : la console refuse de confier Kkiapay à un pays d'une autre devise |
| Paiement lancé par le serveur | ❌ aucune API documentée | Le paiement se fait dans **sa fenêtre**, ouverte par son SDK JavaScript |
| Vérification serveur | ✅ `POST /api/v1/transactions/status` | Seule preuve retenue avant d'émettre un billet |
| Webhook | ✅ `transaction.success`, `transaction.failed` | Authentifié par secret, puis **relu** chez Kkiapay |
| Remboursement | ✅ `POST /api/v1/transactions/revert` — **Mobile Money**, **intégral**, frais non rendus | `refund: true`, `partialRefund: false`, `refundMethodKinds: ['MOBILE_MONEY']` ; carte et partiel à la main |
| Versement vers un tiers | ❌ les « reversements » paient **notre** solde sur **nos** comptes | `payout: false` : les retraits des organisateurs se font à la main, depuis la console |
| Solde, disponibilité des opérateurs, liste des transactions | ❌ aucune API documentée | Méthodes facultatives absentes ; le solde se rapproche depuis son tableau de bord |

---

## 2. Architecture

Kkiapay est **un adaptateur** du contrat `PaymentProvider`, rien de plus. Aucun service métier —
commande, billet, grand livre, finance, espace organisateur — ne connaît son nom.

```
Tunnel (web)                         API                                   Kkiapay
────────────                         ───                                   ───────
écran A3 : moyens du pays  ◄── PaymentRoutingService (pays × moyen × prestataire)
« Payer »  ──────────────────►  PaymentsService.initiate
                                   └─ KkiapayProvider.initiate → widget { clé publique, sandbox,
                                                                          montant, partnerId }
openKkiapayWidget (SDK officiel) ─────────────────────────────────────────►  fenêtre de paiement
◄──────────────────────────────── succès { transactionId } ────────────────
POST …/payments/:id/confirm ──►  PaymentsService.confirmFromCheckout
                                   └─ KkiapayProvider.getStatus ──────────►  transactions/status
                                   └─ lien : partnerId = paiement ? montant = dû ?
                                   └─ applyOutcome → commande PAID, billets, grand livre
                                 WebhooksController ◄──────────────────────  transaction.success
                                   └─ secret, relecture, même contrôle → sans effet si déjà appliqué
```

| Élément générique ajouté au contrat | Pourquoi |
| ----------------------------------- | -------- |
| `checkoutFlow(kind)` → `push` \| `redirect` \| `widget` | L'écran et le service se règlent sur la façon de valider, jamais sur le nom du prestataire |
| `InitiatePaymentResult.widget`, `widget()` | La fenêtre se prépare côté serveur (clé publique, bac à sable) et se reconstruit pour la rouvrir |
| `ProviderPaymentStatus.amount / merchantReference / payerPhone` | Lier une transaction à UN paiement sans ambiguïté |
| `NormalizedPaymentWebhook.merchantReference` | Retrouver le paiement quand la page n'a pas encore transmis la transaction |
| `capabilities.refundMethodKinds` | Kkiapay ne rembourse que le Mobile Money |
| `PaymentProviderDefinition.currencies` | Kkiapay n'encaisse qu'en XOF |
| `ProviderTransactionNotFoundError` | Distinguer une référence inconnue d'une panne |

**Corrélation** : `Order.reference` ↔ `Payment.id` ↔ transaction Kkiapay. Notre identifiant de
paiement part en `partnerId` et revient avec la transaction ; la transaction est stockée en
`payment.providerReference` (identifiant EXTERNE — jamais à la place du nôtre) ; la référence de
commande part en `data`, pour la retrouver depuis le tableau de bord Kkiapay. Aucune colonne propre à
Kkiapay : `provider = 'kkiapay'`, sa réponse brute dans `providerPayload`.

---

## 3. Le parcours de paiement

1. **Choix du moyen** (écran A3) : les moyens viennent de la configuration du pays de la commande.
   Pour un moyen en `widget`, aucun numéro n'est demandé chez nous — c'est la fenêtre qui le demande.
   L'écran prévient que des frais de l'opérateur peuvent s'ajouter (§6).
2. **Initiation** : un `Payment` `PENDING` qui expire **avec la réservation** (30 min) ; aucun appel à
   Kkiapay. L'API renvoie la configuration de la fenêtre.
3. **Fenêtre** : la page charge `https://cdn.kkiapay.me/k.js` et ouvre la fenêtre, limitée à la famille
   du moyen choisi (`paymentmethod: momo | card`) et au pays de la commande (`countries`).
4. **Retour de la fenêtre** : la page transmet la référence de transaction (`POST
   /checkout/orders/:ref/payments/:id/confirm`). **Le serveur lit la transaction chez Kkiapay** et
   n'applique que ce qu'il lit.
5. **Confirmation** : `applyOutcome` — seul point de changement d'état, sous verrou — passe le
   paiement à `SUCCEEDED`, la commande à `PAID`, émet les billets et écrit le grand livre dans une seule
   transaction.

**La fenêtre ne prouve rien.** Son SDK écoute les messages de la page sans en vérifier l'origine : un
« succès » peut y être fabriqué. Une transaction n'est retenue que si Kkiapay confirme qu'elle porte
**notre `partnerId`** et **exactement le montant dû** — une commande à 5 000 F ne se règle ni avec une
transaction de 100 F, ni avec celle d'une autre commande.

**Un échec n'est qu'une tentative.** Dans la fenêtre, l'acheteur peut réessayer sur le **même**
paiement. Un échec vérifié est consigné et montré ; le paiement reste `PENDING` jusqu'au succès ou à la
fin de la réservation. Changer de moyen réutilise aussi le même paiement.

**Trois chemins, un seul verdict** : la page, le webhook et la réconciliation (chaque minute) passent
tous par `applyOutcome`. Un webhook reçu cinq fois, une page qui confirme en même temps : une seule
émission de billets.

**Succès tardif** : si Kkiapay confirme un paiement que nous avions clos (réservation écoulée), il
passe quand même à `SUCCEEDED` ; la commande est honorée si ses places sont encore libres, sinon le
rapprochement la signale pour remboursement (voir `TECHNICAL_ARCHITECTURE.md` §6.3).

**Encaissement en double** : une commande n'a jamais qu'un paiement réussi (garanti par la base). Une
seconde transaction réussie — deux onglets, une fenêtre rouverte — n'émet rien de plus : elle est
consignée et signalée au rapprochement (« Commande payée deux fois »), à rembourser depuis le tableau
de bord Kkiapay. L'acheteur voit sa commande confirmée.

**Rien ne s'est rapporté ?** Console → Finance → Transactions → le paiement → « Rattacher une
transaction Kkiapay » : la référence donnée par l'acheteur est vérifiée avec les mêmes contrôles.

---

## 4. Statuts

| Kkiapay (`transactions/status`) | Nexa-Kabi | Remarque |
| ------------------------------- | --------- | -------- |
| `SUCCESS` | `SUCCEEDED` | Seulement si `partnerId` et montant concordent |
| `PENDING` | reste `PENDING` | La transaction est rattachée pour être relue |
| `FAILED`, `INSUFFICIENT_FUND` | tentative échouée | Le paiement reste ouvert (§3) ; raison traduite en français |
| `REVERTED` | tentative échouée | Réussie puis remboursée : rien n'est encaissé |
| `TRANSACTION_NOT_FOUND`, `INVALID_TRANSACTION`, type ≠ `DEBIT` | refus | Référence inconnue ou étrangère : consigné, rien n'est appliqué |
| tout autre statut | reste `PENDING` | Rien n'est conclu sur un mot inconnu |

Les statuts Kkiapay ne sortent jamais de l'adaptateur ; le reste de l'application ne connaît que
`PaymentStatus`.

---

## 5. Webhook

| Réglage (tableau de bord → Développeurs → Clés API → Webhook) | Valeur |
| ------------------------------------------------------------- | ------ |
| URL | `https://<api>/api/webhooks/payments/kkiapay` |
| Événements | `transaction.success`, `transaction.failed` |
| Secret hash | la valeur de `KKIAPAY_WEBHOOK_SECRET` |

- **Authentification** : l'en-tête `x-kkiapay-secret` doit être soit le secret lui-même, soit la
  signature HMAC-SHA256 du corps brut faite avec lui (hexadécimal ou base 64) — la documentation parle de
  signature mais montre le secret, et les deux formes exigent de le connaître. Comparaisons à temps
  constant (sur des empreintes SHA-256). Absent ou faux → `401`. Il n'est jamais écrit en base. La forme
  reçue est écrite une fois au journal de l'API (« Notification Kkiapay authentifiée : … »).
- **Vérification** : la transaction annoncée est relue chez Kkiapay (`verifyWebhookByFetch`), succès
  comme échec. Relecture impossible → la notification reste `RECEIVED`, la transaction est rattachée,
  la réconciliation conclura.
- **Idempotence** : clé `transactionId:événement` sur `webhook_event (providerCode, externalId)` ; un
  rejeu répond `200` sans effet.
- **Accusé immédiat** : Kkiapay retente cinq fois en quelques secondes ; la notification est acquittée
  tout de suite, traitée ensuite (`waitUntil` sur Vercel).
- **Transactions étrangères** : sans `partnerId` (lien de paiement, transaction du tableau de bord),
  la notification est ignorée — `200`, sans effet. Montant incohérent → écartée et signalée au
  rapprochement.

---

## 6. Frais et grand livre

Le grand livre n'a pas changé : vente, commission, frais du prestataire, net organisateur. Les frais
Kkiapay ne sont **jamais** calculés par un taux écrit dans le code : ils viennent de la vérification.

- `income` (ce que Kkiapay nous crédite) connu : frais **sur nous** = `amount − income` ;
- sinon `feeSupportedBy = customer` : **0** pour nous — l'acheteur les paie en plus du prix ;
- sinon `feeSupportedBy = merchant` et `fees` connu : `fees` ;
- rien de tout cela : inconnu, rien n'est inventé.

**Qui reçoit quoi, pour un billet à 5 000 F** (politique par défaut : 5 %, plancher de 100 F par
commande, frais de service ajoutés à l'acheteur) :

| | Montant | Où c'est écrit |
| - | - | - |
| L'acheteur paie à Nexa-Kabi | 5 250 F (billet + 250 F de frais de service) | `order.totalAmount`, écriture `SALE` |
| Kkiapay, frais **payés par l'acheteur** | en plus, dans sa fenêtre (≈ 1,9 % en Mobile Money) | nulle part chez nous : cet argent ne nous parvient pas |
| Kkiapay, frais **retenus sur le marchand** | `amount − income` | écriture `PROVIDER_FEE`, déduite du net de l'organisateur |
| Nexa-Kabi (commission) | 250 F | écriture `PLATFORM_FEE` |
| L'organisateur | 5 000 F − frais retenus sur le marchand | le solde net ; retiré ensuite à la main, moins les frais de retrait (1 %, plafonné à 2 000 F, écriture `PAYOUT_FEE`) |

Les deux pages de Kkiapay ne disent pas la même chose, et c'est pour cela que rien n'est codé en dur :
la page Tarifs (offre Intégration) met tous les frais **à la charge du client** — 1,5 à 1,9 % en Mobile
Money selon le pays, 2,1 % (cartes UEMOA) ou 3 % (hors UEMOA) —, la page « Frais » de la documentation
met 1,9 % sur le client en Mobile Money mais **4 % sur le marchand** pour la carte. Dans le premier cas
la fenêtre affiche un montant supérieur au bouton « Payer » (l'écran de paiement le dit avant
l'ouverture) ; dans le second, les frais réduisent le net de l'organisateur. La vérification de chaque
transaction tranche. La page Tarifs indique aussi un abonnement de 9 900 F HT par mois pour l'offre
Intégration.

---

## 7. Remboursements et versements

**Remboursement** — le modèle ne change pas : un remboursement est **dû dès qu'il est décidé**.

| Moment | Ce qui s'écrit |
| ------ | -------------- |
| Décision (console, ou annulation d'événement) | `Refund` `PENDING`, écritures `REFUND` (+ `REFUND_FEE_REVERSAL`), commande `REFUNDED`, billets annulés |
| Confié à Kkiapay (Mobile Money, intégral) | `revert` ; `SUCCESS`/`REVERTED` → `COMPLETED`, accepté sans statut → `PROCESSING` puis relu (la transaction passe à `REVERTED`) |
| Refusé (`INSUFFICIENT_FUND`, `TRANSACTION_NOT_ELIGIBLE`…) | `FAILED`, raison en français — toujours dû |
| Carte, partiel, refus | À la main : tableau de bord Kkiapay (Transactions → Rembourser) ou transfert, puis « Consigner » dans la console |

Kkiapay n'accepte pas de clé d'idempotence, mais ne rembourse jamais deux fois (`TRANSACTION_NOT_ELIGIBLE`) ;
ce refus est relu, car après une réponse perdue il peut signifier que le premier appel a abouti.

**Versements** — Kkiapay ne verse pas aux organisateurs. Un retrait demandé passe en « à faire à la
main » : l'administrateur envoie l'argent (depuis le compte où Kkiapay reverse notre solde) puis
enregistre le retrait dans la console. MTN MoMo et Moov Money restent ouverts **au versement** au
Bénin pour que l'organisateur puisse y déclarer son compte de réception. Les reversements de Kkiapay
(nos propres fonds) se règlent dans son tableau de bord : périodique, par palier (≥ 50 000 F) ou
instantané (offre Pro) ; gratuits vers Mobile Money, 7 000 F vers un compte bancaire.

---

## 8. Configuration

| Variable | Rôle |
| -------- | ---- |
| `KKIAPAY_PUBLIC_KEY` | Clé publique — ouvre la fenêtre, transmise à la page PAR L'API |
| `KKIAPAY_PRIVATE_KEY` | Clé privée — vérification des transactions, serveur seulement |
| `KKIAPAY_SECRET_KEY` | Clé secrète — remboursements, serveur seulement |
| `KKIAPAY_WEBHOOK_SECRET` | Secret du webhook (16 caractères minimum) — `openssl rand -hex 32` |
| `KKIAPAY_SANDBOX` | `true` = bac à sable (`api-sandbox.kkiapay.me`), `false` = production (`api.kkiapay.me`) |

Garde-fous au démarrage (`config/env.ts`) : les quatre valeurs vont ensemble ; `KKIAPAY_SANDBOX=true`
est **interdit en production**, `false` est **interdit hors production**. Donc :

| Environnement | `NODE_ENV` | Kkiapay |
| ------------- | ---------- | ------- |
| Développement | `development` | Bac à sable (clés de TEST) |
| Préproduction / mise en ligne actuelle | `development` | Bac à sable (clés de TEST) |
| Production | `production` | Live (clés LIVE, compte activé) |

**Aucun paiement n'est simulé** (simulateur retiré le 24 septembre 2026). Sans clé Kkiapay, aucun moyen
de paiement n'est proposé, en développement comme en production. La seule façon d'essayer sans argent
réel est le bac à sable de Kkiapay : ses clés de TEST avec `KKIAPAY_SANDBOX=true`. Le virement bancaire
des retraits, qu'aucun prestataire n'exécute, est porté par le pseudo-prestataire `manual` (« Virement
manuel ») : fait à la main, puis enregistré dans la console.

La politique de sécurité du site autorise nommément `https://cdn.kkiapay.me` (script) et
`https://widget-v3.kkiapay.me` (cadre de la fenêtre) — `apps/web/lib/security-headers.ts`. Si
Kkiapay change l'hôte de sa fenêtre, c'est là qu'il faut le suivre.

---

## 9. Tester en bac à sable

Le compte donne accès au bac à sable **dès sa création**, sans l'enregistrement de la société.

1. Les trois clés **de test** (Développeurs → Clés API) sont dans `apps/api/.env` depuis le
   24 septembre 2026, avec `KKIAPAY_SANDBOX=true` et un `KKIAPAY_WEBHOOK_SECRET` généré. Au démarrage,
   l'API écrit « Kkiapay branché (bac à sable) ».
2. Déclarer le webhook (§5) avec ce même secret. En local, l'API n'est pas joignable depuis Kkiapay :
   le parcours fonctionne quand même — la page confirme la transaction, et la réconciliation relit les
   transactions en attente chaque minute —, mais pour éprouver le webhook il faut une URL publique (API
   déployée, ou tunnel).
3. Bouton « Tester » du formulaire webhook : doit répondre `200` — une notification de test ne
   correspond à aucun paiement, elle est acquittée sans effet. Un `401` signifie que le secret saisi
   diffère de `KKIAPAY_WEBHOOK_SECRET`.
4. Publier un événement à venir avec un billet payant, l'acheter sur le site, choisir MTN MoMo ou Moov
   Money, puis dans la fenêtre :

| Numéro | Opérateur | Scénario |
| ------ | --------- | -------- |
| `61000000`, `97000000` | MTN Bénin | Succès |
| `61000001`, `97000001` | MTN Bénin | Erreur de traitement |
| `61000002`, `97000002` | MTN Bénin | Solde insuffisant |
| `61000003`, `97000003` | MTN Bénin | Paiement refusé |
| `61100000` / `61200000` | MTN Bénin | Succès après 1 / 2 minutes |
| `68000000`, `95000000` | Moov | Succès |
| `68000001` … `68000003` | Moov | Erreur / solde insuffisant / refusé |
| `68100000` / `68200000` | Moov | Succès après 1 / 2 minutes |

   Cartes : `4242 4242 4242 4242` (01/31, CVV 812, PIN 3310, OTP 12345) → succès ;
   `5258 5859 2266 6506` (09/31, CVV 883, PIN 3310, OTP 12345) → solde insuffisant ;
   `5143 0105 2233 9965` (08/32, CVV 276) → carte refusée. Liste complète :
   <https://docs.kkiapay.me/v1/compte/kkiapay-sandbox-guide-de-test>.
5. Vérifier : confirmation et billets sur le site ; dans la console, Finance → Transactions → le
   paiement : chronologie (vérification, notification, commande, billets, grand livre).
6. Rejouer un échec puis un succès sur la même commande : un seul paiement, réussi, un seul lot de
   billets.

### Constaté sur le vrai bac à sable (24 septembre 2026)

- **Les clés sont acceptées** : `transactions/status` sur une transaction inconnue répond HTTP 400
  `{"status":"TRANSACTION_NOT_FOUND"}` (de mauvaises clés donnent HTTP 401
  `{"status":4003,"reason":"Invalid API KEY"}`).
- **`transactions/revert` ne range pas son verdict au même endroit** : sur une transaction inconnue,
  HTTP 400 `{"code":"TRANSACTION_NOT_FOUND","description":"Transaction not found"}` — `code`, pas
  `status`. L'adaptateur lit les deux ; un refus de remboursement arrive donc motivé en français dans la
  console.
- **La fenêtre officielle s'initialise avec la configuration de l'API** : le SDK répond
  `WIDGET_SUCCESSFULLY_INIT` puis `WIDGET_IS_READY`, sans blocage de la politique de sécurité du site.
- **Le code du SDK** (`k.js`) garde un seul écouteur par événement (`addSuccessListener` remplace le
  précédent), expose bien `addPendingListener` et `addKkiapayCloseListener`, et n'accepte pour
  `paymentmethod` que `momo`, `card`, `direct_debit`. Le plugin WooCommerce officiel confirme que le
  succès porte `transactionId` et que l'attribut `data` revient dans le webhook sous `stateData`.

### À confirmer au premier paiement de bac à sable

- **`amount` dans la vérification quand le client paie les frais** : la documentation montre le montant
  hors frais (`amount` 40, `fees` 1, `income` 40), et le plugin WooCommerce officiel compare `amount` au
  total de la commande. S'il incluait les frais, le paiement serait refusé à la vérification — visible
  immédiatement dans la chronologie (Finance → Transactions).
- **La forme de l'en-tête `x-kkiapay-secret`** (secret ou signature) : les deux sont acceptées ; le
  journal de l'API dit laquelle Kkiapay emploie à la première notification.
- **La réponse de `transactions/revert` quand il accepte** et le passage de la transaction à
  `REVERTED` : non décrits. Acceptée sans statut final, la demande passe « en cours » et la transaction
  est relue chaque minute jusqu'à `REVERTED`.
- **Le format du numéro** : les numéros de test ont 8 chiffres, les numéros béninois 10 depuis 2024.
  Aucun numéro n'est pré-rempli dans la fenêtre pour cette raison.

---

## 10. Rapprochement et console

L'espace **Finance** de la console n'a pas changé de structure :

| Écran | Ce qu'il répond |
| ----- | --------------- |
| Vue d'ensemble | La cascade des ventes — brut, frais du prestataire, commission, net organisateurs —, remboursements, retraits, ce que la plateforme doit à date |
| Transactions | Chaque paiement ; son détail en chronologie (vérifications chez Kkiapay, notifications, commande, billets, écritures, remboursements) — et le rattachement manuel d'une transaction |
| Paiements échoués | Causes, taux d'échec par moyen, ventes rattrapées et perdues |
| Remboursements | Files « À faire », « En cours », « Remboursés » ; carte et partiel signalés « à la main » |
| Grand livre | Soldes recalculés par organisation, écritures filtrables |
| Rapprochement | Paiement jamais tranché, notification sans objet, montant incohérent, paiement encaissé sans commande, **commande payée deux fois**, commande hors grand livre, retrait ou remboursement bloqué |
| Rapports | La cascade par organisation, événement, pays ou mois |
| Commissions | Versions successives, indépendantes du moyen de paiement |

Kkiapay ne publie ni son solde ni la liste de ses transactions par API : le solde se rapproche depuis
son tableau de bord (solde de disponibilité) et son export CSV des transactions. Les tâches
`sync-payment-availability` et `sync-payment-providers` n'ont rien à relever chez lui.

---

## 11. Ajouter un autre prestataire

1. Ajouter son code à `PAYMENT_PROVIDERS` (`packages/contracts/src/enums.ts`) et sa définition à
   `PAYMENT_PROVIDER_DEFINITIONS` (`payments.ts`) : libellé, `status: 'ACTIVE'`, devises, codes de
   moyens (relevés dans SA documentation, jamais déduits).
2. Écrire `apps/api/src/modules/payments/providers/<nom>.provider.ts` : `checkoutFlow`, `initiate`,
   `getStatus` (avec `amount` et `merchantReference` s'il les donne), `parseWebhook`, `refund` ; les
   capacités **telles que sa documentation les confirme** ; `payout`, `getBalance`… seulement s'ils
   existent. Le registre refuse de démarrer une capacité annoncée sans sa méthode.
3. L'enregistrer dans `PaymentsModule` derrière ses variables, et ajouter leurs garde-fous à
   `config/env.ts` et `.env.example`.
4. Pour un prestataire à fenêtre : un lanceur dans `apps/web/lib/payment-widget.ts`, et ses origines
   dans la politique de sécurité du site.
5. Créer ses lignes pays × moyen (migration ou console « Pays & paiements »).

Rien d'autre ne change : commande, billet, grand livre, finance, espace organisateur.
