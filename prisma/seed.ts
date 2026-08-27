import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}

if (!password || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
  throw new Error("SUPER_ADMIN_PASSWORD must be between 8 and 72 bytes");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const passwordHash = await bcrypt.hash(password!, 12);

  await prisma.user.upsert({
    where: { username: "superadmin" },
    update: {
      passwordHash,
      role: Role.SUPER_ADMIN,
      apartmentId: null,
      isActive: true,
      mustChangePassword: true,
    },
    create: {
      username: "superadmin",
      passwordHash,
      role: Role.SUPER_ADMIN,
      apartmentId: null,
      mustChangePassword: true,
    },
  });

  console.log("Seeded SUPER_ADMIN user: superadmin");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

