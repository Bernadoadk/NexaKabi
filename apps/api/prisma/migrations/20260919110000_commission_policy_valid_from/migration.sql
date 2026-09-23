-- La politique de commission par défaut était datée de `CURRENT_TIMESTAMP`,
-- écrit dans une colonne SANS fuseau : PostgreSQL y met l'heure LOCALE de la
-- session (Africa/Lagos, UTC+1), que Prisma relit comme de l'UTC. Résultat :
-- une politique valide « dans une heure », donc ignorée pendant une heure
-- après la migration, et des commandes créées sans politique rattachée.
--
-- Une date fixe, dans le passé, ne dépend d'aucune horloge ni d'aucun fuseau.
UPDATE "commission_policy"
  SET "validFrom" = TIMESTAMP '2026-01-01 00:00:00'
  WHERE "id" = 'policy_platform_default';
