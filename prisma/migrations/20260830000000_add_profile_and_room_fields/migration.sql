ALTER TABLE "User_Admin"
ADD COLUMN "fullName" VARCHAR(200);

ALTER TABLE "User_Tenant"
ADD COLUMN "fullName" VARCHAR(200),
ADD COLUMN "roomNumber" VARCHAR(20);

UPDATE "User_Tenant"
SET
  "fullName" = "username",
  "roomNumber" = "username"
WHERE "fullName" IS NULL OR "roomNumber" IS NULL;

ALTER TABLE "User_Tenant"
ALTER COLUMN "fullName" SET NOT NULL,
ALTER COLUMN "roomNumber" SET NOT NULL;

CREATE UNIQUE INDEX "User_Tenant_apartmentId_roomNumber_key"
ON "User_Tenant"("apartmentId", "roomNumber");
