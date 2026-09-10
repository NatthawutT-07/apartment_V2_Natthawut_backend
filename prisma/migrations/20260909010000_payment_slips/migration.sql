CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "PaymentSubmission" (
  "id" UUID NOT NULL, "billId" UUID NOT NULL, "apartmentId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "roomId" UUID, "roomNumber" VARCHAR(20) NOT NULL,
  "tenantName" VARCHAR(200) NOT NULL, "uploadKey" TEXT NOT NULL, "objectKey" TEXT,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "transferredAt" TIMESTAMP(3) NOT NULL,
  "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'UPLOADING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3), "reviewedById" UUID, "rejectionNote" VARCHAR(500),
  CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentSubmission_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentSubmission_uploadKey_key" ON "PaymentSubmission"("uploadKey");
CREATE UNIQUE INDEX "PaymentSubmission_objectKey_key" ON "PaymentSubmission"("objectKey");
CREATE INDEX "PaymentSubmission_apartmentId_roomNumber_createdAt_idx" ON "PaymentSubmission"("apartmentId", "roomNumber", "createdAt");
CREATE INDEX "PaymentSubmission_apartmentId_roomId_createdAt_idx" ON "PaymentSubmission"("apartmentId", "roomId", "createdAt");
CREATE INDEX "PaymentSubmission_tenantId_createdAt_idx" ON "PaymentSubmission"("tenantId", "createdAt");
-- One active submission per bill, including concurrent requests.
CREATE UNIQUE INDEX "PaymentSubmission_active_bill_key" ON "PaymentSubmission"("billId") WHERE "status" IN ('UPLOADING', 'PENDING');
