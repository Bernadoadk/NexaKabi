-- KPay, seul prestataire du lancement.
--
-- ── Ce que cette migration décide ─────────────────────────────────────────
-- Le produit part avec UN prestataire opérationnel. Bictorys reste en base et
-- dans le code — des paiements peuvent porter son code, il faut pouvoir les
-- relire et les rembourser — mais il ne reçoit plus rien de neuf : ses lignes
-- sont fermées, en collecte comme en versement.
--
-- Rien n'est supprimé. Rouvrir Bictorys un jour ne demanderait qu'un geste
-- dans la console ; effacer ses lignes aurait rendu son historique muet.

-- ── 1. L'état opérationnel, relevé chez le prestataire ───────────────────
-- Distinct des drapeaux existants : ceux-ci disent ce que le compte marchand a
-- le DROIT de faire, celui-là ce que l'opérateur fait EN CE MOMENT.
CREATE TYPE "PaymentAvailability" AS ENUM ('OPERATIONAL', 'DELAYED', 'CLOSED', 'UNKNOWN');

ALTER TABLE "country_payment_method"
  ADD COLUMN "collectionAvailability" "PaymentAvailability" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "payoutAvailability"     "PaymentAvailability" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "availabilityCheckedAt"  TIMESTAMP(3);

-- ── 2. Bictorys se retire ─────────────────────────────────────────────────
UPDATE "country_payment_method"
   SET "collectionEnabled" = false,
       "payoutEnabled"     = false,
       "updatedAt"         = CURRENT_TIMESTAMP
 WHERE "providerCode" = 'bictorys';

-- ── 3. KPay passe devant ──────────────────────────────────────────────────
-- Les positions descendent sous 100 : `resolveCollection` retient la première
-- ligne effective par position croissante, et KPay était rangé derrière.
--
-- L'ouverture ne vaut que pour le Mobile Money — le seul que KPay traite pour
-- nous. La carte n'est confiée à personne pour l'instant : sa page KPay
-- facture en USD, incompatible avec nos entiers de francs CFA.
--
-- Le VERSEMENT s'ouvre aussi : c'est par là que les organisateurs retirent
-- leurs recettes, et KPay verse vers les mêmes opérateurs qu'il encaisse.
UPDATE "country_payment_method"
   SET "collectionEnabled" = true,
       "payoutEnabled"     = true,
       "position"          = "position" - 110,
       "updatedAt"         = CURRENT_TIMESTAMP
 WHERE "providerCode" = 'kpay';

-- ── 4. Le virement bancaire reste ─────────────────────────────────────────
-- Porté par `mock` par convention : aucun prestataire ne l'exécute, il se fait
-- à la main et s'enregistre dans la console. Il n'est pas concerné par le
-- retrait de Bictorys, et reste le recours quand un organisateur n'a pas de
-- compte Mobile Money.
UPDATE "country_payment_method"
   SET "payoutEnabled" = true,
       "updatedAt"     = CURRENT_TIMESTAMP
 WHERE "methodCode" = 'bank_transfer';
