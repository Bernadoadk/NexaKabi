-- Une commande ne dépasse l'état de brouillon qu'avec des coordonnées.
--
-- Le tunnel crée la commande dès la sélection des billets, avant que l'acheteur
-- n'ait donné son nom : c'est ce qui permet de bloquer les places pendant la
-- saisie. Ces champs sont donc vides en DRAFT, et cette contrainte garantit
-- qu'aucun chemin — code, script d'administration, correction manuelle — ne
-- laisse une commande payée sans le numéro par lequel le billet est livré.
ALTER TABLE "order"
  ADD CONSTRAINT "order_buyer_identified_beyond_draft"
  CHECK (
    "status" = 'DRAFT'
    OR ("buyerPhone" <> '' AND "buyerName" <> '')
  );

-- Une commande payée porte toujours sa date d'encaissement.
ALTER TABLE "order"
  ADD CONSTRAINT "order_paid_has_timestamp"
  CHECK (
    "status" NOT IN ('PAID', 'COMPLETED')
    OR "paidAt" IS NOT NULL
  );

-- Un paiement porte sur un montant strictement positif : un encaissement à
-- zéro masquerait une erreur de calcul des frais.
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_amount_positive"
  CHECK ("amount" > 0);
