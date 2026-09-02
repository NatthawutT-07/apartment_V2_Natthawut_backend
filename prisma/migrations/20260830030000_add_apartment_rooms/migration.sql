CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "roomNumber" VARCHAR(20) NOT NULL,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_apartmentId_roomNumber_key"
ON "Room"("apartmentId", "roomNumber");

CREATE INDEX "Room_apartmentId_isActive_idx"
ON "Room"("apartmentId", "isActive");

ALTER TABLE "Room"
ADD CONSTRAINT "Room_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing tenant room numbers are real occupied rooms.
INSERT INTO "Room" (
  "id", "apartmentId", "roomNumber", "isPlaceholder", "isActive", "updatedAt"
)
SELECT
  (
    SUBSTRING(MD5(tenant."apartmentId"::text || ':' || tenant."roomNumber"), 1, 8) || '-' ||
    SUBSTRING(MD5(tenant."apartmentId"::text || ':' || tenant."roomNumber"), 9, 4) || '-' ||
    SUBSTRING(MD5(tenant."apartmentId"::text || ':' || tenant."roomNumber"), 13, 4) || '-' ||
    SUBSTRING(MD5(tenant."apartmentId"::text || ':' || tenant."roomNumber"), 17, 4) || '-' ||
    SUBSTRING(MD5(tenant."apartmentId"::text || ':' || tenant."roomNumber"), 21, 12)
  )::uuid,
  tenant."apartmentId",
  tenant."roomNumber",
  false,
  true,
  CURRENT_TIMESTAMP
FROM "User_Tenant" AS tenant
ON CONFLICT ("apartmentId", "roomNumber") DO NOTHING;

-- Never let the stored capacity be lower than known room records.
UPDATE "Apartment" AS apartment
SET "totalRooms" = GREATEST(
  apartment."totalRooms",
  (SELECT COUNT(*)::INTEGER FROM "Room" WHERE "apartmentId" = apartment."id")
);

-- Backfill unnamed vacant rooms when the old schema only stored a room count.
WITH room_counts AS (
  SELECT apartment."id", apartment."totalRooms", COUNT(room."id")::INTEGER AS existing_rooms
  FROM "Apartment" AS apartment
  LEFT JOIN "Room" AS room ON room."apartmentId" = apartment."id"
  GROUP BY apartment."id", apartment."totalRooms"
)
INSERT INTO "Room" (
  "id", "apartmentId", "roomNumber", "isPlaceholder", "isActive", "updatedAt"
)
SELECT
  (
    SUBSTRING(MD5(counts."id"::text || ':placeholder:' || sequence.value), 1, 8) || '-' ||
    SUBSTRING(MD5(counts."id"::text || ':placeholder:' || sequence.value), 9, 4) || '-' ||
    SUBSTRING(MD5(counts."id"::text || ':placeholder:' || sequence.value), 13, 4) || '-' ||
    SUBSTRING(MD5(counts."id"::text || ':placeholder:' || sequence.value), 17, 4) || '-' ||
    SUBSTRING(MD5(counts."id"::text || ':placeholder:' || sequence.value), 21, 12)
  )::uuid,
  counts."id",
  'UNASSIGNED-' || LPAD(sequence.value::text, 3, '0'),
  true,
  true,
  CURRENT_TIMESTAMP
FROM room_counts AS counts
CROSS JOIN LATERAL GENERATE_SERIES(
  1,
  GREATEST(counts."totalRooms" - counts.existing_rooms, 0)
) AS sequence(value);
