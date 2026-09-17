import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BankAccountType,
  BillStatus,
  BillingCalculation,
  BillingItemKind,
  PrismaClient,
  Role,
} from "../src/generated/prisma/client.js";

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
      floor: String(floor),
      idCard: String(1_000_000_000_000 + apartmentIndex * 50 + index),
      phone: `08${phoneSequence}`,
    };
  });
}

type SeedBillItem = {
  name: string;
  kind: BillingItemKind;
  calculationType: BillingCalculation;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
};

const sampleBillItems: SeedBillItem[] = [
  { name: "ค่าเช่าห้อง", kind: BillingItemKind.RENT, calculationType: BillingCalculation.FIXED, quantity: 1, unitPrice: 4500, amount: 4500, sortOrder: 1 },
  { name: "ค่าน้ำ", kind: BillingItemKind.WATER, calculationType: BillingCalculation.USAGE, quantity: 12, unitPrice: 18, amount: 216, sortOrder: 2 },
  { name: "ค่าไฟ", kind: BillingItemKind.ELECTRICITY, calculationType: BillingCalculation.USAGE, quantity: 85, unitPrice: 7, amount: 595, sortOrder: 3 },
];

async function seedBill(input: {
  id: string;
  apartmentId: string;
  tenantId: string;
  tenantName: string;
  roomNumber: string;
  billingPeriod: Date;
  issuedAt: Date;
  dueDate: Date;
  status: BillStatus;
  paidAt?: Date;
  items?: SeedBillItem[];
}) {
  const items = input.items ?? sampleBillItems;
  const totalAmount = items.reduce((total, item) => total + item.amount, 0);
  const billData = {
    apartmentId: input.apartmentId,
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    roomNumber: input.roomNumber,
    billingPeriod: input.billingPeriod,
    issuedAt: input.issuedAt,
    dueDate: input.dueDate,
    status: input.status,
    paidAt: input.paidAt ?? null,
    totalAmount,
  };

  await prisma.bill.upsert({
    where: { id: input.id },
    update: {
      ...billData,
      items: { deleteMany: {}, create: items.map((item) => ({ ...item })) },
    },
    create: {
      id: input.id,
      ...billData,
      items: { create: items.map((item) => ({ ...item })) },
    },
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

    await prisma.apartmentBankAccount.upsert({
      where: { id: `ba000000-0000-4000-8000-${String(apartmentIndex + 1).padStart(12, "0")}` },
      update: {
        apartmentId: apartment.id,
        createdByAdminId: owner.id,
        bankCode: "KBANK",
        bankName: "ธนาคารกสิกรไทย",
        accountType: BankAccountType.SAVINGS,
        accountName: sample.name,
        accountNumber: `123456${String(apartmentIndex + 1).padStart(4, "0")}`,
        isPrimary: true,
        isActive: true,
      },
      create: {
        id: `ba000000-0000-4000-8000-${String(apartmentIndex + 1).padStart(12, "0")}`,
        apartmentId: apartment.id,
        createdByAdminId: owner.id,
        bankCode: "KBANK",
        bankName: "ธนาคารกสิกรไทย",
        accountType: BankAccountType.SAVINGS,
        accountName: sample.name,
        accountNumber: `123456${String(apartmentIndex + 1).padStart(4, "0")}`,
        isPrimary: true,
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
    await prisma.apartmentBillingItem.createMany({
      data: [
        { apartmentId: apartment.id, name: "ค่าเช่าห้อง", kind: "RENT", calculationType: "FIXED", unitPrice: 0, sortOrder: 1 },
        { apartmentId: apartment.id, name: "ค่าน้ำ", kind: "WATER", calculationType: "USAGE", unitPrice: 0, sortOrder: 2 },
        { apartmentId: apartment.id, name: "ค่าไฟ", kind: "ELECTRICITY", calculationType: "USAGE", unitPrice: 0, sortOrder: 3 },
      ],
      skipDuplicates: true,
    });

    for (let offset = 0; offset < tenants.length; offset += 25) {
      const batch = tenants.slice(offset, offset + 25);
      await prisma.$transaction(
        batch.map((tenant) =>
          prisma.tenantUser.upsert({
            where: {
              apartmentId_roomNumber: {
                apartmentId: apartment.id,
                roomNumber: tenant.roomNumber,
              },
            },
            update: {
              fullName: tenant.fullName,
              roomNumber: tenant.roomNumber,
              floor: tenant.floor,
              idCard: tenant.idCard,
              phone: tenant.phone,
              passwordHash: tenantHash,
              isActive: true,
              mustChangePassword,
              username: `${apartment.slug}-${tenant.username}`,
            },
            create: {
              ...tenant,
              username: `${apartment.slug}-${tenant.username}`,
              apartmentId: apartment.id,
              passwordHash: tenantHash,
              mustChangePassword,
            },
          }),
        ),
      );
    }

    if (apartmentIndex === 0) {
      const testTenant = await prisma.tenantUser.findUniqueOrThrow({
        where: { username: `${apartment.slug}-room101` },
        select: { id: true, fullName: true, roomNumber: true },
      });
      const common = {
        apartmentId: apartment.id,
        tenantId: testTenant.id,
        tenantName: testTenant.fullName,
        roomNumber: testTenant.roomNumber,
      };

      // Two SENT bills in the same month exercise per-bill slip uploads.
      await seedBill({
        id: "b1000000-0000-4000-8000-000000000001",
        ...common,
        billingPeriod: new Date("2026-09-01T00:00:00.000Z"),
        issuedAt: new Date("2026-09-01T00:00:00.000Z"),
        dueDate: new Date("2026-09-07T00:00:00.000Z"),
        status: BillStatus.SENT,
      });
      await seedBill({
        id: "b1000000-0000-4000-8000-000000000002",
        ...common,
        billingPeriod: new Date("2026-09-01T00:00:00.000Z"),
        issuedAt: new Date("2026-09-10T00:00:00.000Z"),
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
        status: BillStatus.SENT,
        items: [
          { name: "ค่าที่จอดรถเพิ่มเติม", kind: BillingItemKind.OTHER, calculationType: BillingCalculation.FIXED, quantity: 1, unitPrice: 500, amount: 500, sortOrder: 1 },
        ],
      });
      await seedBill({
        id: "b1000000-0000-4000-8000-000000000003",
        ...common,
        billingPeriod: new Date("2026-08-01T00:00:00.000Z"),
        issuedAt: new Date("2026-08-01T00:00:00.000Z"),
        dueDate: new Date("2026-08-07T00:00:00.000Z"),
        status: BillStatus.PAID,
        paidAt: new Date("2026-08-05T09:30:00.000Z"),
      });
    }

    console.log(
      `Seeded ${sample.name}: ${ownerUsername}, 50 tenants (room101-room510)`,
    );
  }

  console.log("Seed complete: 1 super admin, 10 owners, 10 apartments, 500 tenants, 10 bank accounts, and sample bills for abc-room101");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
