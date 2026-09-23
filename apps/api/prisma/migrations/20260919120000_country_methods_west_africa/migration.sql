-- Moyens de paiement des pays dormants.
--
-- Chaque pays d'Afrique de l'Ouest a son paysage d'opérateurs : Wave et Orange
-- Money à Dakar, Orange Money et MTN à Abidjan, T-Money à Lomé. Sans ces lignes,
-- ouvrir un pays donnerait un tunnel vide jusqu'à ce qu'un administrateur
-- reconstitue ce paysage à la main.
--
-- Ces lignes sont une CONFIGURATION DE DÉPART, pas une promesse : le pays reste
-- fermé tant qu'un administrateur ne l'ouvre pas, et la synchronisation avec
-- Bictorys (au démarrage, puis chaque heure) ferme d'elle-même tout moyen que
-- le compte marchand ne sait pas traiter. Un moyen sans identifiant documenté
-- chez Bictorys — Airtel Money au Niger, par exemple — n'est pas inventé.
--
-- Le virement bancaire est porté par le prestataire `mock` par convention :
-- aucun prestataire ne l'exécute, il se fait toujours à la main et s'enregistre
-- dans la console. Le routage le traite comme manuel quel que soit le prestataire.

INSERT INTO "country_payment_method"
  ("id", "countryCode", "methodCode", "kind", "providerCode", "providerMethodCode", "collectionEnabled", "payoutEnabled", "position", "updatedAt") VALUES
  -- Côte d'Ivoire
  ('cpm_ci_orange_money',  'CI', 'orange_money',  'MOBILE_MONEY',  'bictorys', 'orange_money',  true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_ci_mtn_momo',      'CI', 'mtn_momo',      'MOBILE_MONEY',  'bictorys', 'mtn_money',     true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_ci_wave',          'CI', 'wave',          'MOBILE_MONEY',  'bictorys', 'wave_money',    true,  true,  20, CURRENT_TIMESTAMP),
  ('cpm_ci_moov_money',    'CI', 'moov_money',    'MOBILE_MONEY',  'bictorys', 'moov',          true,  true,  30, CURRENT_TIMESTAMP),
  ('cpm_ci_card',          'CI', 'card',          'CARD',          'bictorys', 'card',          true,  false, 40, CURRENT_TIMESTAMP),
  ('cpm_ci_bank_transfer', 'CI', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  50, CURRENT_TIMESTAMP),
  -- Sénégal
  ('cpm_sn_wave',          'SN', 'wave',          'MOBILE_MONEY',  'bictorys', 'wave_money',    true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_sn_orange_money',  'SN', 'orange_money',  'MOBILE_MONEY',  'bictorys', 'orange_money',  true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_sn_free_money',    'SN', 'free_money',    'MOBILE_MONEY',  'bictorys', 'free_money',    true,  true,  20, CURRENT_TIMESTAMP),
  ('cpm_sn_card',          'SN', 'card',          'CARD',          'bictorys', 'card',          true,  false, 30, CURRENT_TIMESTAMP),
  ('cpm_sn_bank_transfer', 'SN', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  40, CURRENT_TIMESTAMP),
  -- Togo
  ('cpm_tg_t_money',       'TG', 't_money',       'MOBILE_MONEY',  'bictorys', 'togocell',      true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_tg_moov_money',    'TG', 'moov_money',    'MOBILE_MONEY',  'bictorys', 'moov',          true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_tg_card',          'TG', 'card',          'CARD',          'bictorys', 'card',          true,  false, 20, CURRENT_TIMESTAMP),
  ('cpm_tg_bank_transfer', 'TG', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  30, CURRENT_TIMESTAMP),
  -- Burkina Faso
  ('cpm_bf_orange_money',  'BF', 'orange_money',  'MOBILE_MONEY',  'bictorys', 'orange_money',  true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_bf_moov_money',    'BF', 'moov_money',    'MOBILE_MONEY',  'bictorys', 'moov',          true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_bf_card',          'BF', 'card',          'CARD',          'bictorys', 'card',          true,  false, 20, CURRENT_TIMESTAMP),
  ('cpm_bf_bank_transfer', 'BF', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  30, CURRENT_TIMESTAMP),
  -- Mali
  ('cpm_ml_orange_money',  'ML', 'orange_money',  'MOBILE_MONEY',  'bictorys', 'orange_money',  true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_ml_moov_money',    'ML', 'moov_money',    'MOBILE_MONEY',  'bictorys', 'moov',          true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_ml_card',          'ML', 'card',          'CARD',          'bictorys', 'card',          true,  false, 20, CURRENT_TIMESTAMP),
  ('cpm_ml_bank_transfer', 'ML', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  30, CURRENT_TIMESTAMP),
  -- Niger : Airtel Money n'a pas d'identifiant chez Bictorys ; carte et virement seulement.
  ('cpm_ne_card',          'NE', 'card',          'CARD',          'bictorys', 'card',          true,  false, 0,  CURRENT_TIMESTAMP),
  ('cpm_ne_bank_transfer', 'NE', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  10, CURRENT_TIMESTAMP),
  -- Guinée
  ('cpm_gn_orange_money',  'GN', 'orange_money',  'MOBILE_MONEY',  'bictorys', 'orange_money',  true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_gn_mtn_momo',      'GN', 'mtn_momo',      'MOBILE_MONEY',  'bictorys', 'mtn_money',     true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_gn_card',          'GN', 'card',          'CARD',          'bictorys', 'card',          true,  false, 20, CURRENT_TIMESTAMP),
  ('cpm_gn_bank_transfer', 'GN', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  30, CURRENT_TIMESTAMP),
  -- Cameroun
  ('cpm_cm_orange_money',  'CM', 'orange_money',  'MOBILE_MONEY',  'bictorys', 'orange_money',  true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_cm_mtn_momo',      'CM', 'mtn_momo',      'MOBILE_MONEY',  'bictorys', 'mtn_money',     true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_cm_card',          'CM', 'card',          'CARD',          'bictorys', 'card',          true,  false, 20, CURRENT_TIMESTAMP),
  ('cpm_cm_bank_transfer', 'CM', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  30, CURRENT_TIMESTAMP),
  -- Ghana
  ('cpm_gh_mtn_momo',      'GH', 'mtn_momo',      'MOBILE_MONEY',  'bictorys', 'mtn_money',     true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_gh_card',          'GH', 'card',          'CARD',          'bictorys', 'card',          true,  false, 10, CURRENT_TIMESTAMP),
  ('cpm_gh_bank_transfer', 'GH', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  20, CURRENT_TIMESTAMP),
  -- Nigeria
  ('cpm_ng_card',          'NG', 'card',          'CARD',          'bictorys', 'card',          true,  false, 0,  CURRENT_TIMESTAMP),
  ('cpm_ng_bank_transfer', 'NG', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  10, CURRENT_TIMESTAMP)
ON CONFLICT ("countryCode", "methodCode", "providerCode") DO NOTHING;
