-- KPay est abandonné (23 septembre 2026) : Kkiapay devient le prestataire actif.
--
-- Aucune colonne ne change : un paiement porte le code de son prestataire
-- (`providerCode`) et la référence de sa transaction (`providerReference`),
-- quel que soit le prestataire. Seule la configuration pays × moyen change.

-- Les lignes KPay disparaissent. Aucun paiement ne les référence — un paiement
-- porte le code de son prestataire, pas une ligne de configuration — et KPay
-- n'a jamais encaissé : ses clés n'ont jamais été posées.
DELETE FROM "country_payment_method" WHERE "providerCode" = 'kpay';

-- Kkiapay au Bénin : les moyens que sa documentation confirme pour ce pays —
-- MTN Mobile Money, Moov Money, carte Visa/Mastercard —, ouverts à la collecte.
-- `providerMethodCode` est la famille de sa fenêtre de paiement (`momo`, `card`).
--
-- Le Mobile Money reste ouvert au VERSEMENT : Kkiapay ne verse pas aux
-- organisateurs, ces retraits se font à la main depuis la console, vers le
-- compte que l'organisateur a déclaré — le moyen doit donc rester choisissable.
--
-- Celtiis Cash figure dans la FAQ de Kkiapay mais pas dans sa page des moyens
-- de paiement : la ligne est créée FERMÉE, à ouvrir depuis la console une fois
-- constatée sur le compte.
INSERT INTO "country_payment_method"
  ("id", "countryCode", "methodCode", "kind", "providerCode", "providerMethodCode", "collectionEnabled", "payoutEnabled", "position", "updatedAt") VALUES
  ('cpm_bj_kkiapay_mtn_momo',     'BJ', 'mtn_momo',     'MOBILE_MONEY', 'kkiapay', 'momo', true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_bj_kkiapay_moov_money',   'BJ', 'moov_money',   'MOBILE_MONEY', 'kkiapay', 'momo', true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_bj_kkiapay_celtiis_cash', 'BJ', 'celtiis_cash', 'MOBILE_MONEY', 'kkiapay', 'momo', false, false, 20, CURRENT_TIMESTAMP),
  ('cpm_bj_kkiapay_card',         'BJ', 'card',         'CARD',         'kkiapay', 'card', true,  false, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("countryCode", "methodCode", "providerCode") DO NOTHING;
