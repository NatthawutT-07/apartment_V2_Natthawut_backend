CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'APARTMENT_ADMIN', 'TENANT');

CREATE TABLE "Apartment" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "subdomain" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" VARCHAR(30),
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "apartmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Apartment_slug_key" ON "Apartment"("slug");
CREATE UNIQUE INDEX "Apartment_subdomain_key" ON "Apartment"("subdomain");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_apartmentId_idx" ON "User"("apartmentId");

ALTER TABLE "User"
ADD CONSTRAINT "User_apartmentId_fkey"
FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

