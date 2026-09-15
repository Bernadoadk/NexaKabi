-- Protection ultime contre la sur-vente.
--
-- La vérification applicative peut être contournée par une erreur de code, une
-- course entre deux requêtes, ou une correction manuelle en base. Cette
-- contrainte, elle, ne peut pas l'être : PostgreSQL refusera l'écriture.
ALTER TABLE "ticket_type"
  ADD CONSTRAINT "ticket_type_stock_within_total"
  CHECK ("quantitySold" + "quantityReserved" <= "quantityTotal");

-- Les quantités ne descendent jamais sous zéro.
ALTER TABLE "ticket_type"
  ADD CONSTRAINT "ticket_type_quantities_non_negative"
  CHECK ("quantitySold" >= 0 AND "quantityReserved" >= 0 AND "quantityTotal" >= 0);

-- Un événement se termine après avoir commencé, et les portes n'ouvrent pas
-- après le début.
ALTER TABLE "event"
  ADD CONSTRAINT "event_ends_after_start"
  CHECK ("endsAt" > "startsAt");

ALTER TABLE "event"
  ADD CONSTRAINT "event_doors_before_start"
  CHECK ("doorsOpenAt" IS NULL OR "doorsOpenAt" <= "startsAt");

-- Recherche plein texte en français.
--
-- La configuration `french` gère la désaccentuation et les mots vides de la
-- langue : chercher « evenement » doit trouver « événement ».
CREATE INDEX "event_search_idx" ON "event"
  USING GIN (to_tsvector('french', coalesce("title", '') || ' ' || coalesce("subtitle", '') || ' ' || coalesce("description", '')));

-- Catalogue public : le chemin le plus emprunté du produit.
CREATE INDEX "event_public_listing_idx" ON "event" ("startsAt")
  WHERE "status" = 'PUBLISHED' AND "visibility" = 'PUBLIC' AND "deletedAt" IS NULL;
