-- KPay — configuration de départ.
--
-- KPay traite le Mobile Money dans douze pays derrière une seule API. Son
-- catalogue d'opérateurs (docs KPay, « Opérateurs & pays ») ne retient pour
-- l'Afrique de l'Ouest que le Bénin, la Côte d'Ivoire et le Sénégal : le Togo
-- n'y figure pas, ni Wave dans aucun pays. Ces lignes sont relevées une par
-- une dans ce catalogue — aucun code n'est déduit du motif `OPÉRATEUR_PAYS`,
-- parce qu'il souffre des exceptions (`AIRTEL_OAPI_UGA`).
--
-- La carte n'est pas confiée à KPay : sa page hébergée facture en USD, alors
-- qu'une commande Nexa-Kabi est un entier de francs CFA. Elle reste au
-- prestataire qui encaisse en XOF.
--
-- ── Pourquoi tout arrive FERMÉ ────────────────────────────────────────────
-- `collectionEnabled` et `payoutEnabled` sont à `false` : ces lignes rendent
-- KPay CONFIGURABLE, elles ne le mettent pas en service. Un administrateur
-- ouvre chaque moyen depuis « Pays & paiements » quand les clés sont posées et
-- le compte validé. Les activer ici ferait basculer des paiements réels au
-- premier déploiement, sans que personne l'ait décidé.
--
-- ── Pourquoi les positions sont hautes ────────────────────────────────────
-- `resolveCollection` retient la PREMIÈRE ligne effective, par position
-- croissante. Au-dessus de 100, KPay se range derrière les lignes existantes :
-- rien ne change tant qu'on ne le remonte pas devant, et la bascule d'un moyen
-- consiste alors à échanger deux positions.

INSERT INTO "country_payment_method"
  ("id", "countryCode", "methodCode", "kind", "providerCode", "providerMethodCode", "collectionEnabled", "payoutEnabled", "position", "updatedAt") VALUES
  -- Bénin
  ('cpm_bj_kpay_mtn_momo',     'BJ', 'mtn_momo',     'MOBILE_MONEY', 'kpay', 'MTN_MOMO_BEN', false, false, 110, CURRENT_TIMESTAMP),
  ('cpm_bj_kpay_moov_money',   'BJ', 'moov_money',   'MOBILE_MONEY', 'kpay', 'MOOV_BEN',     false, false, 120, CURRENT_TIMESTAMP),
  -- Côte d'Ivoire
  ('cpm_ci_kpay_mtn_momo',     'CI', 'mtn_momo',     'MOBILE_MONEY', 'kpay', 'MTN_MOMO_CIV', false, false, 110, CURRENT_TIMESTAMP),
  ('cpm_ci_kpay_orange_money', 'CI', 'orange_money', 'MOBILE_MONEY', 'kpay', 'ORANGE_CIV',   false, false, 120, CURRENT_TIMESTAMP),
  -- Sénégal
  ('cpm_sn_kpay_orange_money', 'SN', 'orange_money', 'MOBILE_MONEY', 'kpay', 'ORANGE_SEN',   false, false, 110, CURRENT_TIMESTAMP),
  ('cpm_sn_kpay_free_money',   'SN', 'free_money',   'MOBILE_MONEY', 'kpay', 'FREE_SEN',     false, false, 120, CURRENT_TIMESTAMP),
  -- Cameroun
  ('cpm_cm_kpay_mtn_momo',     'CM', 'mtn_momo',     'MOBILE_MONEY', 'kpay', 'MTN_MOMO_CMR', false, false, 110, CURRENT_TIMESTAMP),
  ('cpm_cm_kpay_orange_money', 'CM', 'orange_money', 'MOBILE_MONEY', 'kpay', 'ORANGE_CMR',   false, false, 120, CURRENT_TIMESTAMP)
ON CONFLICT ("countryCode", "methodCode", "providerCode") DO NOTHING;
