ALTER TABLE "AdminApartment"
ADD COLUMN "accessStartsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "accessEndsAt" TIMESTAMP(3);

UPDATE "AdminApartment"
SET
  "accessStartsAt" = "createdAt",
  "accessEndsAt" = "createdAt" + INTERVAL '365 days';

ALTER TABLE "AdminApartment"
ALTER COLUMN "accessEndsAt" SET NOT NULL;

ALTER TABLE "AdminApartment"
ADD CONSTRAINT "AdminApartment_access_period_check"
CHECK ("accessEndsAt" >= "accessStartsAt");
