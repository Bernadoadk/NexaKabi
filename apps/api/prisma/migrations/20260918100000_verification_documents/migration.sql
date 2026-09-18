-- Pièces supplémentaires de vérification : ce qu'un modérateur peut réclamer,
-- et ce que l'organisateur peut déposer en retour.
--
-- ── Le principe qui commande ces colonnes ───────────────────────────────────
-- Le Livre cinquième du Code du numérique béninois (loi n° 2017-20) n'autorise
-- une collecte que si elle est NÉCESSAIRE à une finalité déterminée. Demander
-- une pièce d'identité à tous les organisateurs ne l'est pas. La demander à
-- celui dont le dossier pose un problème nommé, si.
--
-- `requestedDocuments` est ce qui rend cette règle exécutable : elle est vide
-- pour tout le monde, et c'est le modérateur qui, dossier par dossier, y écrit
-- ce qu'il réclame. L'API refuse toute pièce qui n'y figure pas.
--
-- `consentVersion` / `consentAt` gardent la preuve du consentement exprès sans
-- lequel l'image d'un visage — donnée biométrique au sens béninois — ne peut
-- pas être traitée. `purgedAt` date la destruction du fichier : une pièce
-- d'identité n'a plus d'objet une fois la décision rendue.

-- ── Nouveaux types de pièces ────────────────────────────────────────────────
-- Postgres refuse d'employer une valeur ajoutée à un type énuméré dans la même
-- transaction que son ajout. Ces valeurs ne sont utilisées par aucune instruction
-- de ce fichier : la transaction implicite de Prisma les accepte donc telles quelles.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SELFIE' BEFORE 'CIP';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'ID_CARD' AFTER 'CIP';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'ASSOCIATION_RECEIPT' BEFORE 'ASSOCIATION_STATUTES';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'INSTITUTION_ACT' AFTER 'ASSOCIATION_STATUTES';

-- ── Ce que le modérateur réclame ────────────────────────────────────────────
ALTER TABLE "verification_request"
  ADD COLUMN "requestedDocuments" "DocumentType"[] DEFAULT ARRAY[]::"DocumentType"[];

-- Les dossiers existants n'ont rien demandé : liste vide, pas NULL. Un tableau
-- nul et un tableau vide se lisent pareil côté client et se comportent
-- différemment côté SQL — autant n'avoir qu'un seul cas.
UPDATE "verification_request" SET "requestedDocuments" = ARRAY[]::"DocumentType"[]
  WHERE "requestedDocuments" IS NULL;

ALTER TABLE "verification_request"
  ALTER COLUMN "requestedDocuments" SET NOT NULL;

-- ── Consentement et destruction ─────────────────────────────────────────────
ALTER TABLE "verification_document"
  ADD COLUMN "consentVersion" INTEGER,
  ADD COLUMN "consentAt"      TIMESTAMP(3),
  ADD COLUMN "purgedAt"       TIMESTAMP(3);
