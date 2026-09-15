-- Équipe d'administration : identifiants nom.owner@id / nom.staff@id, accès
-- par espace, et fin de la double authentification.
--
-- ── Rôles ───────────────────────────────────────────────────────────────────
-- SUPERADMIN devient OWNER (le propriétaire, unique), ADMIN et SUPPORT
-- deviennent STAFF (des employés, dont les droits sont désormais cochés par le
-- propriétaire — vides ici, à compléter depuis l'écran Équipe). Postgres ne
-- retire pas une valeur d'un type énuméré : on recrée le type.
CREATE TYPE "GlobalRole_new" AS ENUM ('USER', 'OWNER', 'STAFF');

ALTER TABLE "user" ALTER COLUMN "globalRole" DROP DEFAULT;
ALTER TABLE "user"
  ALTER COLUMN "globalRole" TYPE "GlobalRole_new"
  USING (
    CASE "globalRole"::text
      WHEN 'SUPERADMIN' THEN 'OWNER'
      WHEN 'ADMIN' THEN 'STAFF'
      WHEN 'SUPPORT' THEN 'STAFF'
      ELSE 'USER'
    END
  )::"GlobalRole_new";
ALTER TABLE "user" ALTER COLUMN "globalRole" SET DEFAULT 'USER';

DROP TYPE "GlobalRole";
ALTER TYPE "GlobalRole_new" RENAME TO "GlobalRole";

-- ── Identifiants et droits ──────────────────────────────────────────────────
ALTER TABLE "admin_credential"
  DROP COLUMN "totpSecret",
  DROP COLUMN "totpEnabledAt",
  DROP COLUMN "recoveryCodes",
  DROP COLUMN "lastTotpStep",
  ADD COLUMN "username" TEXT,
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Les comptes existants reçoivent un identifiant dérivé de leur e-mail
-- (partie avant l'arobase) et un suffixe tiré de leur identifiant interne.
-- Le script create-owner.ts permet ensuite de choisir le nom définitif.
UPDATE "admin_credential" c
SET "username" =
  regexp_replace(lower(split_part(coalesce(u."email", 'admin'), '@', 1)), '[^a-z0-9-]', '', 'g')
  || CASE u."globalRole"::text WHEN 'OWNER' THEN '.owner@' ELSE '.staff@' END
  || lower(substr(md5(u."id"), 1, 4))
FROM "user" u
WHERE u."id" = c."userId";

ALTER TABLE "admin_credential" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "admin_credential_username_key" ON "admin_credential"("username");

-- ── Sessions ────────────────────────────────────────────────────────────────
-- Plus de seconde étape : une session est ouverte dès le mot de passe accepté.
ALTER TABLE "admin_session" DROP CONSTRAINT IF EXISTS "admin_session_totp_follows_creation";
ALTER TABLE "admin_session" DROP COLUMN "totpVerifiedAt";
