import bcrypt from "bcrypt";
import {
  BillStatus,
  LineNotificationType,
  Prisma,
  type BillingCalculation,
  type BillingItemKind,
} from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type {
  BillingItemInput,
  CreateBillInput,
  CreateTenantInput,
  ContactInput,
} from "../validation/admin.validation.js";
import { queueBillLineNotification, sendBillLineNotification } from "./line.service.js";

const PASSWORD_HASH_ROUNDS = 12;

function money(value: Prisma.Decimal | number) {
  return Number(value);
}

function dateAtStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function billingPeriod(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function maskIdCard(value: string | null) {
  if (!value) return null;
  return `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function publicBillingItem(item: {
  id: string;
  name: string;
  kind: BillingItemKind;
  calculationType: BillingCalculation;
  unitPrice: Prisma.Decimal;
  sortOrder: number;
}) {
  return { ...item, unitPrice: money(item.unitPrice) };
}

export async function getDashboard(apartmentId: string) {
  const [apartment, unpaidBills] = await Promise.all([
    prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: {
        id: true,
        name: true,
        rooms: {
          where: { isActive: true },
          orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
          select: {
            id: true,
            roomNumber: true,
            floor: true,
            isPlaceholder: true,
          },
        },
        tenants: {
          where: { isActive: true },
          select: {
            id: true,
            username: true,
            fullName: true,
            roomNumber: true,
            floor: true,
            phone: true,
            lineAccount: {
              select: { displayName: true, isActive: true, blockedAt: true },
            },
          },
        },
      },
    }),
    prisma.bill.count({
      where: { apartmentId, status: BillStatus.SENT },
    }),
  ]);

  if (!apartment) throw new AppError(404, "Apartment not found");
  const tenantByRoom = new Map(apartment.tenants.map((tenant) => [tenant.roomNumber, tenant]));
  const rooms = apartment.rooms.map((room) => ({
    ...room,
    tenant: tenantByRoom.get(room.roomNumber) ?? null,
    status: tenantByRoom.has(room.roomNumber) ? "OCCUPIED" as const : "AVAILABLE" as const,
  }));
  const occupiedRooms = rooms.filter((room) => room.status === "OCCUPIED").length;

  return {
    apartment: { id: apartment.id, name: apartment.name },
    summary: {
      totalRooms: rooms.length,
      occupiedRooms,
      availableRooms: rooms.length - occupiedRooms,
      unpaidBills,
    },
    rooms,
  };
}

export async function listBillingItems(apartmentId: string) {
  const items = await prisma.apartmentBillingItem.findMany({
    where: { apartmentId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      calculationType: true,
      unitPrice: true,
      sortOrder: true,
    },
  });
  return items.map(publicBillingItem);
}

export async function createBillingItem(apartmentId: string, input: BillingItemInput) {
  try {
    const item = await prisma.apartmentBillingItem.create({
      data: { ...input, apartmentId, sortOrder: input.sortOrder ?? 100 },
      select: {
        id: true,
        name: true,
        kind: true,
        calculationType: true,
        unitPrice: true,
        sortOrder: true,
      },
    });
    return publicBillingItem(item);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "A billing item with this name already exists");
    }
    throw error;
  }
}

export async function updateBillingItem(
  apartmentId: string,
  itemId: string,
  input: BillingItemInput,
) {
  const existing = await prisma.apartmentBillingItem.findFirst({
    where: { id: itemId, apartmentId, isActive: true },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Billing item not found");

  const item = await prisma.apartmentBillingItem.update({
    where: { id: itemId },
    data: input,
    select: {
      id: true,
      name: true,
      kind: true,
      calculationType: true,
      unitPrice: true,
      sortOrder: true,
    },
  });
  return publicBillingItem(item);
}

export async function deleteBillingItem(apartmentId: string, itemId: string) {
  const result = await prisma.apartmentBillingItem.updateMany({
    where: { id: itemId, apartmentId, isActive: true },
    data: { isActive: false },
  });
  if (!result.count) throw new AppError(404, "Billing item not found");
}

export async function listTenants(apartmentId: string) {
  const tenants = await prisma.tenantUser.findMany({
    where: { apartmentId, isActive: true },
    orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
    select: {
      id: true,
      username: true,
      fullName: true,
      roomNumber: true,
      floor: true,
      idCard: true,
      phone: true,
      moveInDate: true,
      moveOutDate: true,
      createdAt: true,
      lineAccount: {
        select: { displayName: true, isActive: true, linkedAt: true, blockedAt: true },
      },
    },
  });
  return tenants.map(({ idCard, ...tenant }) => ({ ...tenant, idCardMasked: maskIdCard(idCard) }));
}

export async function getTenantFormOptions(apartmentId: string) {
  const [rooms, occupiedTenants, billingItems] = await Promise.all([
    prisma.room.findMany({
      where: { apartmentId, isActive: true },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      select: { id: true, roomNumber: true, floor: true, isPlaceholder: true },
    }),
    prisma.tenantUser.findMany({
      where: { apartmentId, isActive: true },
      select: { roomNumber: true },
    }),
    listBillingItems(apartmentId),
  ]);
  const occupied = new Set(occupiedTenants.map((tenant) => tenant.roomNumber));
  return {
    rooms: rooms.filter((room) => !occupied.has(room.roomNumber)),
    billingItems: billingItems.map((item) => ({
      ...item,
      quantity: item.calculationType === "FIXED" ? 1 : 0,
    })),
  };
}

type BillInput = {
  billingMonth: string;
  dueDate?: string;
  status?: "SENT" | "PAID";
  items: Array<{
    name: string;
    kind: BillingItemKind;
    calculationType: BillingCalculation;
    quantity: number;
    unitPrice: number;
  }>;
};

async function createBillRecord(
  transaction: Prisma.TransactionClient,
  apartmentId: string,
  tenant: { id: string; fullName: string; roomNumber: string },
  input: BillInput,
) {
  const items = input.items.map((item, index) => ({
    ...item,
    sortOrder: index,
    amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
  }));
  const totalAmount = Math.round(items.reduce((total, item) => total + item.amount, 0) * 100) / 100;

  const initialStatus = input.status === "PAID" ? BillStatus.PAID : BillStatus.SENT;
  const bill = await transaction.bill.create({
    data: {
      apartmentId,
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      roomNumber: tenant.roomNumber,
      billingPeriod: billingPeriod(input.billingMonth),
      dueDate: input.dueDate ? dateAtStart(input.dueDate) : undefined,
      status: initialStatus,
      paidAt: initialStatus === BillStatus.PAID ? new Date() : undefined,
      totalAmount,
      items: { create: items },
    },
    select: {
      id: true,
      billingPeriod: true,
      status: true,
      totalAmount: true,
    },
  });
  await queueBillLineNotification(
    transaction,
    bill.id,
    tenant.id,
    initialStatus === BillStatus.PAID ? LineNotificationType.BILL_PAID : LineNotificationType.BILL_CREATED,
  );
  return bill;
}

export async function createTenant(apartmentId: string, input: CreateTenantInput) {
  const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const room = await transaction.room.findFirst({
        where: { id: input.roomId, apartmentId, isActive: true },
        select: { id: true, roomNumber: true },
      });
      if (!room) throw new AppError(404, "Room not found");

      const [occupied, usernameExists, idCardExists, roomNumberExists] = await Promise.all([
        transaction.tenantUser.findUnique({
          where: { apartmentId_roomNumber: { apartmentId, roomNumber: room.roomNumber } },
          select: { id: true },
        }),
        transaction.tenantUser.findUnique({
          where: { username: input.username },
          select: { id: true },
        }),
        transaction.tenantUser.findFirst({
          where: { apartmentId, idCard: input.idCard },
          select: { id: true },
        }),
        transaction.room.findFirst({
          where: { apartmentId, roomNumber: input.roomNumber, NOT: { id: room.id } },
          select: { id: true },
        }),
      ]);
      if (occupied) throw new AppError(409, "Room is already occupied");
      if (usernameExists) throw new AppError(409, "Tenant username is already in use");
      if (idCardExists) throw new AppError(409, "ID card is already in use");
      if (roomNumberExists) throw new AppError(409, "Room number is already in use");

      await transaction.room.update({
        where: { id: room.id },
        data: { roomNumber: input.roomNumber, floor: input.floor, isPlaceholder: false },
      });
      const tenant = await transaction.tenantUser.create({
        data: {
          apartmentId,
          roomNumber: input.roomNumber,
          floor: input.floor,
          fullName: input.fullName,
          idCard: input.idCard,
          phone: input.phone,
          username: input.username,
          passwordHash,
          moveInDate: dateAtStart(input.moveInDate),
          moveOutDate: input.moveOutDate ? dateAtStart(input.moveOutDate) : undefined,
          mustChangePassword: true,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          roomNumber: true,
          floor: true,
          phone: true,
          moveInDate: true,
          moveOutDate: true,
        },
      });

      const bill = input.initialBill
        ? await createBillRecord(transaction, apartmentId, tenant, input.initialBill)
        : null;
      return { tenant, bill };
    });
    if (result.bill) await sendBillLineNotification(
      result.bill.id,
      result.bill.status === BillStatus.PAID ? LineNotificationType.BILL_PAID : LineNotificationType.BILL_CREATED,
    );
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Tenant, username, or ID card already exists");
    }
    throw error;
  }
}

export async function deleteTenant(apartmentId: string, tenantId: string) {
  const tenant = await prisma.tenantUser.findFirst({
    where: { id: tenantId, apartmentId },
    select: { id: true },
  });
  if (!tenant) throw new AppError(404, "Tenant not found");
  await prisma.tenantUser.delete({ where: { id: tenantId } });
}

export async function getBillTemplate(apartmentId: string, tenantId: string) {
  const tenant = await prisma.tenantUser.findFirst({
    where: { id: tenantId, apartmentId, isActive: true },
    select: { id: true, fullName: true, roomNumber: true },
  });
  if (!tenant) throw new AppError(404, "Tenant not found");

  const previous = await prisma.bill.findFirst({
    where: { apartmentId, tenantId },
    orderBy: { billingPeriod: "desc" },
    select: {
      billingPeriod: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          kind: true,
          calculationType: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
  });
  const items = previous
    ? previous.items.map((item) => ({
        ...item,
        quantity: money(item.quantity),
        unitPrice: money(item.unitPrice),
      }))
    : (await listBillingItems(apartmentId)).map((item) => ({
        name: item.name,
        kind: item.kind,
        calculationType: item.calculationType,
        quantity: item.calculationType === "FIXED" ? 1 : 0,
        unitPrice: item.unitPrice,
      }));

  return {
    tenant,
    source: previous ? "PREVIOUS_BILL" as const : "APARTMENT_DEFAULTS" as const,
    previousBillingPeriod: previous?.billingPeriod ?? null,
    items,
  };
}

export async function createBill(apartmentId: string, input: CreateBillInput) {
  const tenant = await prisma.tenantUser.findFirst({
    where: { id: input.tenantId, apartmentId, isActive: true },
    select: { id: true, fullName: true, roomNumber: true },
  });
  if (!tenant) throw new AppError(404, "Tenant not found");

  try {
    const bill = await prisma.$transaction((transaction) =>
      createBillRecord(transaction, apartmentId, tenant, input),
    );
    await sendBillLineNotification(
      bill.id,
      bill.status === BillStatus.PAID ? LineNotificationType.BILL_PAID : LineNotificationType.BILL_CREATED,
    );
    return { ...bill, totalAmount: money(bill.totalAmount) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Unable to create bill because of duplicate data");
    }
    throw error;
  }
}

export async function listBills(apartmentId: string) {
  const bills = await prisma.bill.findMany({
    where: { apartmentId, status: { not: BillStatus.VOID } },
    orderBy: [{ billingPeriod: "desc" }, { issuedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      tenantId: true,
      tenantName: true,
      roomNumber: true,
      billingPeriod: true,
      status: true,
      totalAmount: true,
      issuedAt: true,
      dueDate: true,
      paidAt: true,
      lineNotifications: {
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { eventType: true, status: true, attemptCount: true, lastError: true, sentAt: true },
      },
    },
  });
  return bills.map((bill) => ({ ...bill, totalAmount: money(bill.totalAmount) }));
}

export async function markBillPaid(apartmentId: string, billId: string) {
  const bill = await prisma.bill.findFirst({
    where: { id: billId, apartmentId },
    select: { id: true, status: true },
  });
  if (!bill) throw new AppError(404, "Bill not found");
  if (bill.status === BillStatus.PAID) return bill;
  if (bill.status !== BillStatus.SENT) {
    throw new AppError(409, "Only a sent bill can be marked as paid");
  }
  const updated = await prisma.$transaction(async (transaction) => {
    const paidBill = await transaction.bill.update({
      where: { id: billId, apartmentId, status: BillStatus.SENT },
      data: { status: BillStatus.PAID, paidAt: new Date() },
      select: { id: true, tenantId: true, status: true, paidAt: true },
    });
    if (paidBill.tenantId) await queueBillLineNotification(transaction, billId, paidBill.tenantId, LineNotificationType.BILL_PAID);
    return paidBill;
  });
  if (updated.tenantId) await sendBillLineNotification(billId, LineNotificationType.BILL_PAID);
  return updated;
}

export async function voidBill(apartmentId: string, billId: string) {
  const bill = await prisma.bill.findFirst({
    where: { id: billId, apartmentId },
    select: { id: true, status: true },
  });
  if (!bill) throw new AppError(404, "Bill not found");
  if (bill.status === BillStatus.VOID) return bill;
  if (bill.status !== BillStatus.SENT) {
    throw new AppError(409, "Only an unpaid bill can be cancelled");
  }
  return prisma.bill.update({
    where: { id: billId, apartmentId, status: BillStatus.SENT },
    data: { status: BillStatus.VOID },
    select: { id: true, status: true },
  });
}

function publicContact(contact: {
  id: string;
  label: string;
  contactName: string | null;
  channel: "PHONE" | "LINE";
  value: string;
  note: string | null;
  sortOrder: number;
  createdByAdmin: { id: string; fullName: string | null; username: string };
}) {
  return contact;
}

export async function listContacts(apartmentId: string) {
  const contacts = await prisma.apartmentContact.findMany({
    where: { apartmentId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      contactName: true,
      channel: true,
      value: true,
      note: true,
      sortOrder: true,
      createdByAdmin: { select: { id: true, fullName: true, username: true } },
    },
  });
  return contacts.map(publicContact);
}

export async function createContact(apartmentId: string, adminUserId: string, input: ContactInput) {
  return prisma.apartmentContact.create({
    data: { ...input, apartmentId, createdByAdminId: adminUserId, sortOrder: input.sortOrder ?? 100 },
    select: {
      id: true,
      label: true,
      contactName: true,
      channel: true,
      value: true,
      note: true,
      sortOrder: true,
      createdByAdmin: { select: { id: true, fullName: true, username: true } },
    },
  });
}

export async function updateContact(apartmentId: string, contactId: string, input: ContactInput) {
  const contact = await prisma.apartmentContact.findFirst({
    where: { id: contactId, apartmentId, isActive: true },
    select: { id: true },
  });
  if (!contact) throw new AppError(404, "Contact not found");
  return prisma.apartmentContact.update({
    where: { id: contactId },
    data: input,
    select: {
      id: true,
      label: true,
      contactName: true,
      channel: true,
      value: true,
      note: true,
      sortOrder: true,
      createdByAdmin: { select: { id: true, fullName: true, username: true } },
    },
  });
}

export async function deleteContact(apartmentId: string, contactId: string) {
  const result = await prisma.apartmentContact.updateMany({
    where: { id: contactId, apartmentId, isActive: true },
    data: { isActive: false },
  });
  if (!result.count) throw new AppError(404, "Contact not found");
}
