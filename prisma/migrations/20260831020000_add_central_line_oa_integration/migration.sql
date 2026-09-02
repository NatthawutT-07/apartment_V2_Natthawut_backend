CREATE TYPE "LineNotificationType" AS ENUM ('BILL_CREATED', 'BILL_PAID');
CREATE TYPE "LineNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "LineOaConfig" (
    "id" VARCHAR(30) NOT NULL DEFAULT 'central',
    "oaBasicId" VARCHAR(100) NOT NULL,
    "messagingChannelId" VARCHAR(100) NOT NULL,
    "messagingChannelSecretEncrypted" TEXT NOT NULL,
    "messagingAccessTokenEncrypted" TEXT NOT NULL,
    "loginChannelId" VARCHAR(100) NOT NULL,
    "loginChannelSecretEncrypted" TEXT NOT NULL,
    "apiBaseUrl" VARCHAR(500) NOT NULL,
    "frontendBaseUrl" VARCHAR(500) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LineOaConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantLineAccount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "lineUserId" VARCHAR(100) NOT NULL,
    "displayName" VARCHAR(200),
    "pictureUrl" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantLineAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineLinkInvite" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "oauthStateHash" VARCHAR(64),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LineLinkInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineNotification" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "tenantId" UUID,
    "eventType" "LineNotificationType" NOT NULL,
    "status" "LineNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LineNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantLineAccount_tenantId_key" ON "TenantLineAccount"("tenantId");
CREATE UNIQUE INDEX "TenantLineAccount_lineUserId_key" ON "TenantLineAccount"("lineUserId");
CREATE INDEX "TenantLineAccount_apartmentId_isActive_idx" ON "TenantLineAccount"("apartmentId", "isActive");
CREATE UNIQUE INDEX "LineLinkInvite_tokenHash_key" ON "LineLinkInvite"("tokenHash");
CREATE UNIQUE INDEX "LineLinkInvite_oauthStateHash_key" ON "LineLinkInvite"("oauthStateHash");
CREATE INDEX "LineLinkInvite_tenantId_expiresAt_idx" ON "LineLinkInvite"("tenantId", "expiresAt");
CREATE INDEX "LineLinkInvite_createdByAdminId_idx" ON "LineLinkInvite"("createdByAdminId");
CREATE UNIQUE INDEX "LineNotification_billId_eventType_key" ON "LineNotification"("billId", "eventType");
CREATE INDEX "LineNotification_status_createdAt_idx" ON "LineNotification"("status", "createdAt");
CREATE INDEX "LineNotification_tenantId_idx" ON "LineNotification"("tenantId");

ALTER TABLE "TenantLineAccount" ADD CONSTRAINT "TenantLineAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User_Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantLineAccount" ADD CONSTRAINT "TenantLineAccount_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineLinkInvite" ADD CONSTRAINT "LineLinkInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User_Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineLinkInvite" ADD CONSTRAINT "LineLinkInvite_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User_Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineNotification" ADD CONSTRAINT "LineNotification_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineNotification" ADD CONSTRAINT "LineNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User_Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
