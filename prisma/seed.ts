import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;
const seedDevelopmentAccounts = process.env.SEED_DEVELOPMENT_ACCOUNTS === "true";
const mustChangePassword = process.env.SEED_USERS_MUST_CHANGE_PASSWORD !== "false";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}

function readPassword(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 8 || Buffer.byteLength(value, "utf8") > 72) {
    throw new Error(`${name} must be between 8 and 72 bytes`);
  }
  return value;
}

const superAdminPassword = readPassword("SUPER_ADMIN_PASSWORD");
const apartmentAdminPassword = seedDevelopmentAccounts
  ? readPassword("APARTMENT_ADMIN_PASSWORD")
  : null;
const tenantPassword = seedDevelopmentAccounts ? readPassword("TENANT_PASSWORD") : null;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const [superAdminHash, apartmentAdminHash, tenantHash] = await Promise.all([
    bcrypt.hash(superAdminPassword, 12),
    apartmentAdminPassword ? bcrypt.hash(apartmentAdminPassword, 12) : null,
    tenantPassword ? bcrypt.hash(tenantPassword, 12) : null,
  ]);

  await prisma.adminUser.upsert({
    where: { username: "superadmin" },
    update: {
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      mustChangePassword,
    },
    create: {
      username: "superadmin",
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      mustChangePassword,
    },
  });

  console.log("Seeded SUPER_ADMIN user: superadmin");

  if (!seedDevelopmentAccounts || !apartmentAdminHash || !tenantHash) {
    return;
  }

  const apartment = await prisma.apartment.upsert({
    where: { slug: "abc" },
    update: {
      name: "ABC Apartment",
      subdomain: "abc",
      isActive: true,
    },
    create: {
      name: "ABC Apartment",
      slug: "abc",
      subdomain: "abc",
    },
  });

  await Promise.all([
    prisma.adminUser.upsert({
      where: { username: "owner_abc" },
      update: {
        passwordHash: apartmentAdminHash,
        role: Role.APARTMENT_ADMIN,
        isActive: true,
        mustChangePassword,
      },
      create: {
        username: "owner_abc",
        passwordHash: apartmentAdminHash,
        role: Role.APARTMENT_ADMIN,
        mustChangePassword,
      },
    }),
    prisma.tenantUser.upsert({
      where: {
        apartmentId_username: { apartmentId: apartment.id, username: "room501" },
      },
      update: {
        passwordHash: tenantHash,
        isActive: true,
        mustChangePassword,
      },
      create: {
        username: "room501",
        passwordHash: tenantHash,
        apartmentId: apartment.id,
        mustChangePassword,
      },
    }),
  ]);

  const apartmentAdmin = await prisma.adminUser.findUniqueOrThrow({
    where: { username: "owner_abc" },
    select: { id: true },
  });
  await prisma.adminApartment.upsert({
    where: {
      adminUserId_apartmentId: {
        adminUserId: apartmentAdmin.id,
        apartmentId: apartment.id,
      },
    },
    update: { isPrimary: true },
    create: {
      adminUserId: apartmentAdmin.id,
      apartmentId: apartment.id,
      isPrimary: true,
    },
  });

  console.log("Seeded development users: owner_abc, room501");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
