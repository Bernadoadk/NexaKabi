-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'ASSOCIATION', 'INSTITUTION');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'INCOMPLETE', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'SCANNER', 'ANALYST');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CIP', 'PASSPORT', 'RCCM', 'IFU', 'ASSOCIATION_STATUTES', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutAccountType" AS ENUM ('MOBILE_MONEY', 'BANK');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "type" "OrganizationType" NOT NULL DEFAULT 'INDIVIDUAL',
    "description" TEXT,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "cityName" TEXT,
    "address" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "payoutFrozen" BOOLEAN NOT NULL DEFAULT false,
    "payoutFrozenReason" TEXT,
    "completedEventsCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'INVITED',
    "scopedEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gate" TEXT,
    "invitedById" TEXT,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" "OrgRole" NOT NULL,
    "scopedEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gate" TEXT,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "PayoutAccountType" NOT NULL,
    "provider" TEXT,
    "accountNumber" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payout_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "decisionNote" TEXT,
    "checks" JSONB,

    CONSTRAINT "verification_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_document" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "organization_status_verificationStatus_idx" ON "organization"("status", "verificationStatus");

-- CreateIndex
CREATE INDEX "organization_ownerId_idx" ON "organization"("ownerId");

-- CreateIndex
CREATE INDEX "organization_member_userId_status_idx" ON "organization_member"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_member_organizationId_userId_key" ON "organization_member"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_invitation_tokenHash_key" ON "member_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "member_invitation_organizationId_acceptedAt_idx" ON "member_invitation"("organizationId", "acceptedAt");

-- CreateIndex
CREATE INDEX "member_invitation_expiresAt_idx" ON "member_invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "payout_account_organizationId_deletedAt_idx" ON "payout_account"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "verification_request_organizationId_key" ON "verification_request"("organizationId");

-- CreateIndex
CREATE INDEX "verification_request_status_submittedAt_idx" ON "verification_request"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "verification_document_requestId_status_idx" ON "verification_document"("requestId", "status");

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_invitation" ADD CONSTRAINT "member_invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_invitation" ADD CONSTRAINT "member_invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_account" ADD CONSTRAINT "payout_account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_document" ADD CONSTRAINT "verification_document_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "verification_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
