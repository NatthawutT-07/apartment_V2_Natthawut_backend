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

const apartments = [
  { name: "สุขใจ เรสซิเดนซ์", slug: "abc", owner: "ธนภัทร วัฒนกุล" },
  { name: "เดอะ การ์เด้น เพลส", slug: "garden-place", owner: "พิมพ์ชนก ศรีสวัสดิ์" },
  { name: "ร่มเย็น อพาร์ตเมนต์", slug: "romyen", owner: "ณัฐวุฒิ พรหมรักษา" },
  { name: "บ้านอุ่นใจ", slug: "baan-oonjai", owner: "กัญญารัตน์ มณีวงศ์" },
  { name: "พฤกษา เพลส", slug: "pruksa-place", owner: "ชยพล ตั้งเจริญ" },
  { name: "กรีนวิว เรสซิเดนซ์", slug: "greenview", owner: "อรทัย แสงทอง" },
  { name: "แฮปปี้โฮม อพาร์ตเมนต์", slug: "happy-home", owner: "วรเมธ อินทรชัย" },
  { name: "ริเวอร์ไซด์ เพลส", slug: "riverside", owner: "สุพัตรา ธรรมคุณ" },
  { name: "ต้นไม้ เรสซิเดนซ์", slug: "tonmai", owner: "ปกรณ์ เกียรติไพบูลย์" },
  { name: "ซิตี้คอร์ท อพาร์ตเมนต์", slug: "city-court", owner: "นิชาภา รัตนวงศ์" },
] as const;

const firstNames = [
  "กิตติพงศ์", "ชลธิชา", "ธนกร", "พิชญา", "ณัฐชา", "วรัญญา", "ศุภชัย", "ปวีณา",
  "ภาคภูมิ", "ชนิกานต์", "สิรวิชญ์", "นภัสสร", "ธีรภัทร", "มนัสวี", "อัครเดช", "พัชรินทร์",
  "รัชชานนท์", "ญาดา", "พีรวิชญ์", "ขวัญฤดี", "ณภัทร", "อริสรา", "วีรภัทร", "กมลชนก",
  "เจษฎา", "สุชาดา", "นราวิชญ์", "ธัญชนก", "ภาณุวัฒน์", "พรนภา",
] as const;

const lastNames = [
  "สุขประเสริฐ", "เจริญทรัพย์", "วงศ์วัฒนา", "บุญมี", "พิพัฒน์กุล", "ศรีสมบัติ", "ชัยมงคล",
  "ทองดี", "รัตนชัย", "แสงอรุณ", "ธรรมรักษ์", "อินทร์แก้ว", "วัฒนวงศ์", "เลิศวิไล",
  "จันทร์เพ็ญ", "สมบูรณ์สุข", "รุ่งเรือง", "เกษมศรี", "พูลสวัสดิ์", "มงคลชัย",
  "อุดมทรัพย์", "วิริยะกุล", "เพชรรัตน์", "สุวรรณดี", "ตั้งมั่น",
] as const;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function buildTenants(apartmentIndex: number) {
  const random = seededRandom(20260830 + apartmentIndex);
  return Array.from({ length: 50 }, (_, index) => {
    const floor = Math.floor(index / 10) + 1;
    const roomOnFloor = (index % 10) + 1;
    const roomNumber = `${floor}${String(roomOnFloor).padStart(2, "0")}`;
    const firstName = firstNames[Math.floor(random() * firstNames.length)];
    const lastName = lastNames[Math.floor(random() * lastNames.length)];
    const phoneSequence = 10_000_000 + apartmentIndex * 50 + index;

    return {
      username: `room${roomNumber}`,
      fullName: `${firstName} ${lastName}`,
      roomNumber,
      phone: `08${phoneSequence}`,
    };
  });
}

async function main() {
  const [superAdminHash, apartmentAdminHash, tenantHash] = await Promise.all([
    bcrypt.hash(superAdminPassword, 12),
    apartmentAdminPassword ? bcrypt.hash(apartmentAdminPassword, 12) : null,
    tenantPassword ? bcrypt.hash(tenantPassword, 12) : null,
  ]);

  await prisma.adminUser.upsert({
    where: { username: "superadmin" },
    update: {
      fullName: "ผู้ดูแลระบบส่วนกลาง",
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      mustChangePassword,
    },
    create: {
      username: "superadmin",
      fullName: "ผู้ดูแลระบบส่วนกลาง",
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      mustChangePassword,
    },
  });

  console.log("Seeded 1 super admin: superadmin");

  if (!seedDevelopmentAccounts || !apartmentAdminHash || !tenantHash) {
    console.log("Development account generation is disabled");
    return;
  }

  for (const [apartmentIndex, sample] of apartments.entries()) {
    const apartment = await prisma.apartment.upsert({
      where: { slug: sample.slug },
      update: {
        name: sample.name,
        subdomain: sample.slug,
        totalRooms: 50,
        isActive: true,
      },
      create: {
        name: sample.name,
        slug: sample.slug,
        subdomain: sample.slug,
        totalRooms: 50,
      },
    });

    const ownerUsername = `owner${String(apartmentIndex + 1).padStart(2, "0")}`;
    const owner = await prisma.adminUser.upsert({
      where: { username: ownerUsername },
      update: {
        fullName: sample.owner,
        phone: `09${20_000_000 + apartmentIndex}`,
        passwordHash: apartmentAdminHash,
        role: Role.APARTMENT_ADMIN,
        isActive: true,
        mustChangePassword,
      },
      create: {
        username: ownerUsername,
        fullName: sample.owner,
        phone: `09${20_000_000 + apartmentIndex}`,
        passwordHash: apartmentAdminHash,
        role: Role.APARTMENT_ADMIN,
        mustChangePassword,
      },
    });

    await prisma.adminApartment.upsert({
      where: {
        adminUserId_apartmentId: {
          adminUserId: owner.id,
          apartmentId: apartment.id,
        },
      },
      update: { isPrimary: true },
      create: {
        adminUserId: owner.id,
        apartmentId: apartment.id,
        isPrimary: true,
        accessStartsAt: new Date(),
        accessEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000),
      },
    });

    const tenants = buildTenants(apartmentIndex);
    await prisma.room.createMany({
      data: tenants.map((tenant) => ({
        apartmentId: apartment.id,
        roomNumber: tenant.roomNumber,
      })),
      skipDuplicates: true,
    });

    for (let offset = 0; offset < tenants.length; offset += 25) {
      const batch = tenants.slice(offset, offset + 25);
      await prisma.$transaction(
        batch.map((tenant) =>
          prisma.tenantUser.upsert({
            where: {
              apartmentId_username: {
                apartmentId: apartment.id,
                username: tenant.username,
              },
            },
            update: {
              fullName: tenant.fullName,
              roomNumber: tenant.roomNumber,
              phone: tenant.phone,
              passwordHash: tenantHash,
              isActive: true,
              mustChangePassword,
            },
            create: {
              ...tenant,
              apartmentId: apartment.id,
              passwordHash: tenantHash,
              mustChangePassword,
            },
          }),
        ),
      );
    }

    console.log(
      `Seeded ${sample.name}: ${ownerUsername}, 50 tenants (room101-room510)`,
    );
  }

  console.log("Seed complete: 1 super admin, 10 owners, 10 apartments, 500 tenants");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
