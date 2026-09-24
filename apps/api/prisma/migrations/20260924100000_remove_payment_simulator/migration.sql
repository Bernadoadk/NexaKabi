-- Le simulateur de paiement est retiré (24 septembre 2026).
--
-- Tout paiement passe désormais par un vrai prestataire. Essayer sans argent
-- réel se fait avec les clés de BAC À SABLE de ce prestataire — Kkiapay
-- aujourd'hui —, jamais avec un faux prestataire.
--
-- Les paiements, versements et notifications déjà enregistrés sous le code
-- `mock` ne sont pas touchés : l'historique ne se réécrit pas. Seule la
-- configuration change.

-- ── 1. Le virement bancaire passe au « virement manuel » ──────────────────
-- Il était porté par `mock` « par convention » : aucun prestataire ne
-- l'exécute, l'administrateur le fait à la main puis l'enregistre dans la
-- console. `manual` dit exactement cela, et n'encaisse jamais rien.
UPDATE "country_payment_method"
   SET "providerCode" = 'manual',
       "updatedAt"    = CURRENT_TIMESTAMP
 WHERE "providerCode" = 'mock'
   AND "methodCode"   = 'bank_transfer';

-- ── 2. Les autres lignes du simulateur disparaissent ──────────────────────
-- Au Bénin, Celtiis Cash (fermé) : Kkiapay a sa propre ligne pour ce moyen.
DELETE FROM "country_payment_method" WHERE "providerCode" = 'mock';

-- ── 3. Plus de moyen de « démonstration » ─────────────────────────────────
-- Jamais utilisé. Un type énuméré ne perd une valeur qu'en étant recréé.
ALTER TYPE "PaymentMethodKind" RENAME TO "PaymentMethodKind_old";

CREATE TYPE "PaymentMethodKind" AS ENUM ('MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'CASH');

ALTER TABLE "country_payment_method"
  ALTER COLUMN "kind" TYPE "PaymentMethodKind" USING ("kind"::text::"PaymentMethodKind");

DROP TYPE "PaymentMethodKind_old";

-- ── 4. Un paiement nomme toujours son moyen ───────────────────────────────
-- La valeur par défaut `mock` datait de la migration des paiements existants.
-- Le code renseigne le moyen à chaque création : plus de défaut du tout.
ALTER TABLE "payment" ALTER COLUMN "methodCode" DROP DEFAULT;
