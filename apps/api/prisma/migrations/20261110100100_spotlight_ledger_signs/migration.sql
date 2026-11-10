-- Grand livre : le signe des deux écritures de la mise en avant.
--
-- Séparée de la migration précédente, qui crée ces valeurs : PostgreSQL refuse
-- d'employer une valeur d'énumération dans la transaction qui l'ajoute.
--
-- Même règle qu'à l'origine (20260904192136_finance) : une écriture n'est
-- jamais nulle, et son signe suit son type. Une place payée sur le solde
-- (`SPOTLIGHT_PURCHASE`) le fait baisser ; une place refusée
-- (`SPOTLIGHT_REFUND`) le rend.

ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_sign_matches_type";

ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_sign_matches_type"
  CHECK (
    "amount" <> 0
    AND (
      ("type" IN ('SALE', 'RELEASE', 'REFUND_FEE_REVERSAL', 'PAYOUT_REVERSAL', 'UNFREEZE', 'SPOTLIGHT_REFUND') AND "amount" > 0)
      OR ("type" IN ('HOLD', 'PLATFORM_FEE', 'PROVIDER_FEE', 'REFUND', 'PAYOUT', 'PAYOUT_FEE', 'FREEZE', 'SPOTLIGHT_PURCHASE') AND "amount" < 0)
      OR "type" = 'ADJUSTMENT'
    )
  );

-- Une écriture de mise en avant désigne toujours la place qu'elle règle ou
-- rembourse : sans elle, le relevé dirait « Mise en avant » sans dire laquelle.
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_spotlight_has_booking"
  CHECK (
    "type" NOT IN ('SPOTLIGHT_PURCHASE', 'SPOTLIGHT_REFUND')
    OR "spotlightBookingId" IS NOT NULL
  );
