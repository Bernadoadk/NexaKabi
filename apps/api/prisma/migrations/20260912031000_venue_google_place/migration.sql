-- Lieu localisé par Google Places.
ALTER TABLE "venue" ADD COLUMN "googlePlaceId" TEXT;
CREATE INDEX "venue_googlePlaceId_idx" ON "venue"("googlePlaceId");
