CREATE TYPE "BankAccountType" AS ENUM ('SAVINGS', 'CURRENT', 'PROMPTPAY');

CREATE TABLE "ApartmentBankAccount" (
    "id" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "bankCode" VARCHAR(30) NOT NULL,
    "bankName" VARCHAR(100) NOT NULL,
    "accountType" "BankAccountType" NOT NULL,
    "accountName" VARCHAR(200) NOT NULL,
    "accountNumber" VARCHAR(50) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApartmentBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApartmentBankAccount_apartmentId_isActive_isPrimary_idx"
ON "ApartmentBankAccount"("apartmentId", "isActive", "isPrimary");

ALTER TABLE "ApartmentBankAccount" ADD CONSTRAINT "ApartmentBankAccount_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApartmentBankAccount" ADD CONSTRAINT "ApartmentBankAccount_createdByAdminId_fkey"
FOREIGN KEY ("createdByAdminId") REFERENCES "User_Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
