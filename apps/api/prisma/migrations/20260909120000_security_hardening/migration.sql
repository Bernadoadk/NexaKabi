-- Durcissement de sécurité.
--
-- 1. Blocage anti-force-brute des comptes d'administration, porté par la base
--    plutôt que par la mémoire d'une instance : un redémarrage ne doit pas
--    remettre le compteur à zéro, et deux instances doivent compter ensemble.
--
-- 2. Rotation du lien public d'un billet : le jeton d'accès n'expire jamais,
--    le porteur doit pouvoir couper un partage qu'il regrette.

ALTER TABLE "admin_credential"
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

ALTER TABLE "ticket"
  ADD COLUMN "accessTokenRotatedAt" TIMESTAMP(3);

-- 3. Anti-rejeu TOTP porté par la base, pour la même raison que le compteur
--    d'échecs : en mémoire, la protection tombait à chaque redémarrage et ne
--    couvrait qu'une seule instance.
ALTER TABLE "admin_credential"
  ADD COLUMN "lastTotpStep" INTEGER;
