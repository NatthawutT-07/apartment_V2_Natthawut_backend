-- CreateEnum
CREATE TYPE "RoomSizeUnit" AS ENUM ('SQM', 'SQWA');

-- Add editable room details and a stable room reference for tenants.
ALTER TABLE "Room"
  ADD COLUMN "code" VARCHAR(30),
  ADD COLUMN "displayName" VARCHAR(100),
  ADD COLUMN "size" DECIMAL(8,2),
  ADD COLUMN "sizeUnit" "RoomSizeUnit" NOT NULL DEFAULT 'SQM';

WITH numbered_rooms AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "apartmentId" ORDER BY "createdAt", id) AS position
  FROM "Room"
)
UPDATE "Room" AS room
SET "code" = 'RM-' || LPAD(numbered_rooms.position::text, 4, '0')
FROM numbered_rooms
WHERE room.id = numbered_rooms.id;

ALTER TABLE "Room" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Room_apartmentId_code_key" ON "Room"("apartmentId", "code");

ALTER TABLE "User_Tenant" ADD COLUMN "roomId" UUID;
UPDATE "User_Tenant" AS tenant
SET "roomId" = room.id
FROM "Room" AS room
WHERE room."apartmentId" = tenant."apartmentId"
  AND room."roomNumber" = tenant."roomNumber";

ALTER TABLE "User_Tenant" ALTER COLUMN "roomId" SET NOT NULL;
CREATE INDEX "User_Tenant_roomId_idx" ON "User_Tenant"("roomId");
ALTER TABLE "User_Tenant"
  ADD CONSTRAINT "User_Tenant_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
