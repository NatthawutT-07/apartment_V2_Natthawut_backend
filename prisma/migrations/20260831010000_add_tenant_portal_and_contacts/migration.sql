CREATE TYPE "ContactChannel" AS ENUM ('PHONE', 'LINE');

ALTER TABLE "Bill" ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE TABLE "ApartmentContact" (
    "id" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "contactName" VARCHAR(150),
    "channel" "ContactChannel" NOT NULL,
    "value" VARCHAR(150) NOT NULL,
    "note" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApartmentContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApartmentContact_apartmentId_isActive_sortOrder_idx"
ON "ApartmentContact"("apartmentId", "isActive", "sortOrder");

CREATE INDEX "ApartmentContact_createdByAdminId_idx"
ON "ApartmentContact"("createdByAdminId");

ALTER TABLE "ApartmentContact" ADD CONSTRAINT "ApartmentContact_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApartmentContact" ADD CONSTRAINT "ApartmentContact_createdByAdminId_fkey"
FOREIGN KEY ("createdByAdminId") REFERENCES "User_Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
