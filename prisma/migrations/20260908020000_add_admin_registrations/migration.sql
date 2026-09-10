CREATE TYPE "RegistrationPlan" AS ENUM ('FREE_30_DAYS', 'TRIAL_3_MONTHS', 'FULL_1_YEAR');
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AdminRegistration" (
  "id" UUID NOT NULL,
  "plan" "RegistrationPlan" NOT NULL,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
  "firstNameTh" VARCHAR(100) NOT NULL,
  "lastNameTh" VARCHAR(100) NOT NULL,
  "firstNameEn" VARCHAR(100) NOT NULL,
  "lastNameEn" VARCHAR(100) NOT NULL,
  "birthDate" TIMESTAMP(3) NOT NULL,
  "phone" VARCHAR(30) NOT NULL,
  "email" VARCHAR(200) NOT NULL,
  "ownerFullNameTh" VARCHAR(200) NOT NULL,
  "ownerFullNameEn" VARCHAR(200) NOT NULL,
  "apartmentNameTh" VARCHAR(200) NOT NULL,
  "apartmentNameEn" VARCHAR(200) NOT NULL,
  "totalRooms" INTEGER NOT NULL,
  "houseNumber" VARCHAR(50) NOT NULL,
  "moo" VARCHAR(50),
  "subdistrict" VARCHAR(100) NOT NULL,
  "district" VARCHAR(100) NOT NULL,
  "province" VARCHAR(100) NOT NULL,
  "postalCode" VARCHAR(10) NOT NULL,
  "approvedAdminId" UUID,
  "approvedApartmentId" UUID,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminRegistration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminRegistration_status_createdAt_idx" ON "AdminRegistration"("status", "createdAt");
CREATE INDEX "AdminRegistration_email_idx" ON "AdminRegistration"("email");
