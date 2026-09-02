CREATE TYPE "BillingItemKind" AS ENUM ('RENT', 'WATER', 'ELECTRICITY', 'OTHER');
CREATE TYPE "BillingCalculation" AS ENUM ('FIXED', 'USAGE');
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID');

ALTER TABLE "User_Tenant"
ADD COLUMN "floor" VARCHAR(20),
ADD COLUMN "idCard" VARCHAR(30),
ADD COLUMN "moveInDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "moveOutDate" TIMESTAMP(3);

UPDATE "User_Tenant"
SET
  "floor" = LEFT("roomNumber", GREATEST(LENGTH("roomNumber") - 2, 1)),
  "moveInDate" = "createdAt";

CREATE UNIQUE INDEX "User_Tenant_apartmentId_idCard_key"
ON "User_Tenant"("apartmentId", "idCard");

ALTER TABLE "Room" ADD COLUMN "floor" VARCHAR(20);

UPDATE "Room"
SET "floor" = LEFT("roomNumber", GREATEST(LENGTH("roomNumber") - 2, 1))
WHERE "isPlaceholder" = false;

CREATE TABLE "ApartmentBillingItem" (
    "id" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "BillingItemKind" NOT NULL,
    "calculationType" "BillingCalculation" NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApartmentBillingItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bill" (
    "id" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "tenantId" UUID,
    "tenantName" VARCHAR(200) NOT NULL,
    "roomNumber" VARCHAR(20) NOT NULL,
    "billingPeriod" TIMESTAMP(3) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'SENT',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillItem" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "BillingItemKind" NOT NULL,
    "calculationType" "BillingCalculation" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApartmentBillingItem_apartmentId_name_key" ON "ApartmentBillingItem"("apartmentId", "name");
CREATE INDEX "ApartmentBillingItem_apartmentId_isActive_sortOrder_idx" ON "ApartmentBillingItem"("apartmentId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "Bill_tenantId_billingPeriod_key" ON "Bill"("tenantId", "billingPeriod");
CREATE INDEX "Bill_apartmentId_billingPeriod_idx" ON "Bill"("apartmentId", "billingPeriod");
CREATE INDEX "Bill_apartmentId_status_idx" ON "Bill"("apartmentId", "status");
CREATE INDEX "BillItem_billId_sortOrder_idx" ON "BillItem"("billId", "sortOrder");

ALTER TABLE "ApartmentBillingItem" ADD CONSTRAINT "ApartmentBillingItem_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "User_Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey"
FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ApartmentBillingItem" (
  "id", "apartmentId", "name", "kind", "calculationType", "unitPrice", "sortOrder", "updatedAt"
)
SELECT
  (
    SUBSTRING(MD5(apartment."id"::text || ':billing:' || defaults.kind::text), 1, 8) || '-' ||
    SUBSTRING(MD5(apartment."id"::text || ':billing:' || defaults.kind::text), 9, 4) || '-' ||
    SUBSTRING(MD5(apartment."id"::text || ':billing:' || defaults.kind::text), 13, 4) || '-' ||
    SUBSTRING(MD5(apartment."id"::text || ':billing:' || defaults.kind::text), 17, 4) || '-' ||
    SUBSTRING(MD5(apartment."id"::text || ':billing:' || defaults.kind::text), 21, 12)
  )::uuid,
  apartment."id",
  defaults.name,
  defaults.kind,
  defaults.calculation,
  0,
  defaults.sort_order,
  CURRENT_TIMESTAMP
FROM "Apartment" AS apartment
CROSS JOIN (
  VALUES
    ('ค่าเช่าห้อง', 'RENT'::"BillingItemKind", 'FIXED'::"BillingCalculation", 1),
    ('ค่าน้ำ', 'WATER'::"BillingItemKind", 'USAGE'::"BillingCalculation", 2),
    ('ค่าไฟ', 'ELECTRICITY'::"BillingItemKind", 'USAGE'::"BillingCalculation", 3)
) AS defaults(name, kind, calculation, sort_order);
