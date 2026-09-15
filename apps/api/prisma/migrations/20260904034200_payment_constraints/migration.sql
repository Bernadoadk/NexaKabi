-- Une commande ne peut avoir QU'UN SEUL paiement réussi.
--
-- Sans cet index, un webhook rejoué sur une commande déjà payée, ou deux
-- tentatives concurrentes qui aboutissent toutes les deux, encaisseraient le
-- client deux fois. Un index unique partiel rend la situation impossible,
-- quelle que soit la logique applicative.
CREATE UNIQUE INDEX "payment_one_success_per_order"
  ON "payment" ("orderId")
  WHERE "status" = 'SUCCEEDED';

-- Les montants d'une commande restent cohérents entre eux.
ALTER TABLE "order"
  ADD CONSTRAINT "order_amounts_non_negative"
  CHECK (
    "subtotalAmount" >= 0
    AND "discountAmount" >= 0
    AND "totalAmount" >= 0
    AND "platformFeeAmount" >= 0
  );

-- La remise ne dépasse jamais le sous-total : un total négatif signifierait
-- que la plateforme rembourse un achat qui n'a pas eu lieu.
ALTER TABLE "order"
  ADD CONSTRAINT "order_discount_within_subtotal"
  CHECK ("discountAmount" <= "subtotalAmount");

-- Un remboursement porte sur un montant strictement positif.
ALTER TABLE "refund"
  ADD CONSTRAINT "refund_amount_positive"
  CHECK ("amount" > 0);

-- Une réservation porte sur au moins une place.
ALTER TABLE "stock_reservation"
  ADD CONSTRAINT "reservation_quantity_positive"
  CHECK ("quantity" > 0);

-- Une ligne de commande porte sur au moins un billet.
ALTER TABLE "order_item"
  ADD CONSTRAINT "order_item_quantity_positive"
  CHECK ("quantity" > 0);
