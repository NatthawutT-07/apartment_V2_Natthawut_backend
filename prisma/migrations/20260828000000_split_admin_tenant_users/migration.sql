-- Split authentication identities by portal while preserving existing accounts.
CREATE TABLE "User_Admin" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" VARCHAR(30),
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_Admin_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_Admin_role_check" CHECK ("role" IN ('SUPER_ADMIN', 'APARTMENT_ADMIN'))
);

CREATE TABLE "User_Tenant" (
    "id" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" VARCHAR(30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminApartment" (
    "adminUserId" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminApartment_pkey" PRIMARY KEY ("adminUserId", "apartmentId")
);

INSERT INTO "User_Admin" (
    "id", "username", "passwordHash", "phone", "role", "isActive",
    "mustChangePassword", "createdAt", "updatedAt"
)
SELECT
    "id", "username", "passwordHash", "phone", "role", "isActive",
    "mustChangePassword", "createdAt", "updatedAt"
FROM "User"
WHERE "role" IN ('SUPER_ADMIN', 'APARTMENT_ADMIN');

INSERT INTO "User_Tenant" (
    "id", "apartmentId", "username", "passwordHash", "phone", "isActive",
    "mustChangePassword", "createdAt", "updatedAt"
)
SELECT
    "id", "apartmentId", "username", "passwordHash", "phone", "isActive",
    "mustChangePassword", "createdAt", "updatedAt"
FROM "User"
WHERE "role" = 'TENANT' AND "apartmentId" IS NOT NULL;

INSERT INTO "AdminApartment" ("adminUserId", "apartmentId", "isPrimary")
SELECT "id", "apartmentId", true
FROM "User"
WHERE "role" = 'APARTMENT_ADMIN' AND "apartmentId" IS NOT NULL;

CREATE UNIQUE INDEX "User_Admin_username_key" ON "User_Admin"("username");
CREATE UNIQUE INDEX "User_Tenant_apartmentId_username_key"
ON "User_Tenant"("apartmentId", "username");
CREATE INDEX "User_Tenant_username_idx" ON "User_Tenant"("username");
CREATE INDEX "AdminApartment_apartmentId_idx" ON "AdminApartment"("apartmentId");

ALTER TABLE "User_Tenant"
ADD CONSTRAINT "User_Tenant_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdminApartment"
ADD CONSTRAINT "AdminApartment_adminUserId_fkey"
FOREIGN KEY ("adminUserId") REFERENCES "User_Admin"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminApartment"
ADD CONSTRAINT "AdminApartment_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "User";
