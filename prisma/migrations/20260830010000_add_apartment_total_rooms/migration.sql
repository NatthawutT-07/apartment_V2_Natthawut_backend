ALTER TABLE "Apartment"
ADD COLUMN "totalRooms" INTEGER NOT NULL DEFAULT 0;

UPDATE "Apartment" AS apartment
SET "totalRooms" = (
  SELECT COUNT(DISTINCT tenant."roomNumber")::INTEGER
  FROM "User_Tenant" AS tenant
  WHERE tenant."apartmentId" = apartment."id"
);

ALTER TABLE "Apartment"
ADD CONSTRAINT "Apartment_totalRooms_check" CHECK ("totalRooms" >= 0);
