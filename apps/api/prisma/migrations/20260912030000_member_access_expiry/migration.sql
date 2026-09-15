-- Accès temporaire des membres d'équipe.
--
-- Un contrôleur invité pour une soirée perd l'accès 24 h après la fin du
-- dernier événement qui lui est assigné. La ligne d'appartenance reste : ses
-- scans lui restent attribués, et l'organisation garde de quoi le payer.
ALTER TABLE "organization_member" ADD COLUMN "expiresAt" TIMESTAMP(3);
