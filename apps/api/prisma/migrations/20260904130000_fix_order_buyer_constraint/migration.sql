-- Correction de « order_buyer_identified_beyond_draft ».
--
-- La règle précédente exigeait des coordonnées d'acheteur pour TOUT état autre
-- que DRAFT. Elle rendait impossible la sortie normale d'un panier abandonné :
-- le balayage d'expiration passe une commande de DRAFT à EXPIRED, et une
-- annulation la passe à CANCELLED — dans les deux cas sans acheteur, puisque
-- personne n'a jamais saisi ses coordonnées.
--
-- Conséquence observée en test : la libération des places échouait, et un
-- panier abandonné aurait bloqué ses places indéfiniment. Un événement aurait
-- affiché « complet » alors qu'il restait des billets.
--
-- La contrainte vise désormais les états où de l'argent est en jeu, et eux
-- seuls. L'intention initiale — aucune commande payée sans le numéro par
-- lequel le billet est livré — est préservée.
ALTER TABLE "order"
  DROP CONSTRAINT "order_buyer_identified_beyond_draft";

ALTER TABLE "order"
  ADD CONSTRAINT "order_buyer_identified_when_payable"
  CHECK (
    "status" NOT IN ('AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED')
    OR ("buyerPhone" <> '' AND "buyerName" <> '')
  );
