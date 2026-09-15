-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'REJECTED', 'PUBLISHED', 'SOLD_OUT', 'POSTPONED', 'CANCELLED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('PHYSICAL', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "RefundPolicy" AS ENUM ('UNTIL_DAYS_BEFORE', 'NONE', 'CASE_BY_CASE');

-- CreateEnum
CREATE TYPE "TicketTypeStatus" AS ENUM ('DRAFT', 'ON_SALE', 'PAUSED', 'SOLD_OUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketVisibility" AS ENUM ('PUBLIC', 'HIDDEN');

-- CreateEnum
CREATE TYPE "EventImageType" AS ENUM ('COVER', 'POSTER', 'GALLERY');

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "colorToken" TEXT NOT NULL DEFAULT '#1E1A48',
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'BJ',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "city_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "cityId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "format" "EventFormat" NOT NULL DEFAULT 'PHYSICAL',
    "venueId" TEXT,
    "cityId" TEXT,
    "onlineUrl" TEXT,
    "onlinePlatform" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "doorsOpenAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Porto-Novo',
    "coverImageUrl" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "postponedFromEventId" TEXT,
    "refundPolicy" "RefundPolicy" NOT NULL DEFAULT 'UNTIL_DAYS_BEFORE',
    "refundDeadlineDays" INTEGER DEFAULT 7,
    "minimumAge" INTEGER,
    "requiresAttendeeName" BOOLEAN NOT NULL DEFAULT false,
    "maxTicketsPerOrder" INTEGER,
    "accessInstructions" TEXT,
    "draftStep" INTEGER DEFAULT 1,
    "draftData" JSONB,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "revenueTotal" INTEGER NOT NULL DEFAULT 0,
    "checkedInCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_image" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "type" "EventImageType" NOT NULL DEFAULT 'GALLERY',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_type" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "quantityTotal" INTEGER NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "minPerOrder" INTEGER NOT NULL DEFAULT 1,
    "maxPerOrder" INTEGER,
    "salesStartAt" TIMESTAMP(3),
    "salesEndAt" TIMESTAMP(3),
    "visibility" "TicketVisibility" NOT NULL DEFAULT 'PUBLIC',
    "accessCode" TEXT,
    "status" "TicketTypeStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_signing_key" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKeyRef" TEXT NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_signing_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "category"("slug");

-- CreateIndex
CREATE INDEX "category_isActive_position_idx" ON "category"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "city_slug_key" ON "city"("slug");

-- CreateIndex
CREATE INDEX "city_countryCode_isActive_idx" ON "city"("countryCode", "isActive");

-- CreateIndex
CREATE INDEX "venue_cityId_idx" ON "venue"("cityId");

-- CreateIndex
CREATE INDEX "venue_organizationId_idx" ON "venue"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "event_slug_key" ON "event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "event_shortCode_key" ON "event"("shortCode");

-- CreateIndex
CREATE INDEX "event_status_visibility_startsAt_idx" ON "event"("status", "visibility", "startsAt");

-- CreateIndex
CREATE INDEX "event_cityId_categoryId_startsAt_idx" ON "event"("cityId", "categoryId", "startsAt");

-- CreateIndex
CREATE INDEX "event_organizationId_status_idx" ON "event"("organizationId", "status");

-- CreateIndex
CREATE INDEX "event_startsAt_idx" ON "event"("startsAt");

-- CreateIndex
CREATE INDEX "event_image_eventId_type_position_idx" ON "event_image"("eventId", "type", "position");

-- CreateIndex
CREATE INDEX "ticket_type_eventId_status_position_idx" ON "ticket_type"("eventId", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "event_signing_key_eventId_key" ON "event_signing_key"("eventId");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue" ADD CONSTRAINT "venue_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "city"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "city"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_image" ADD CONSTRAINT "event_image_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_type" ADD CONSTRAINT "ticket_type_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_signing_key" ADD CONSTRAINT "event_signing_key_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
