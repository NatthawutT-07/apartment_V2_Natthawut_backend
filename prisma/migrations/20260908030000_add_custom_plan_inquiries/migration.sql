CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

CREATE TABLE "CustomPlanInquiry" (
  "id" UUID NOT NULL,
  "fullName" VARCHAR(200) NOT NULL,
  "phone" VARCHAR(30) NOT NULL,
  "email" VARCHAR(200) NOT NULL,
  "lineId" VARCHAR(100),
  "message" VARCHAR(3000) NOT NULL,
  "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
  "contactedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomPlanInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomPlanInquiry_status_createdAt_idx" ON "CustomPlanInquiry"("status", "createdAt");
CREATE INDEX "CustomPlanInquiry_email_idx" ON "CustomPlanInquiry"("email");
