import { BillStatus, Prisma } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";

function decimal(value: Prisma.Decimal) {
  return Number(value);
}

const tenantProfileSelect = {
  id: true,
  username: true,
  fullName: true,
  roomNumber: true,
  floor: true,
  phone: true,
  moveInDate: true,
  moveOutDate: true,
  apartment: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.TenantUserSelect;

export async function getTenantProfile(tenantId: string, apartmentId: string) {
  const tenant = await prisma.tenantUser.findFirst({
    where: { id: tenantId, apartmentId, isActive: true },
    select: tenantProfileSelect,
  });
  if (!tenant) throw new AppError(404, "Tenant not found");
  return tenant;
}

export async function getTenantDashboard(tenantId: string, apartmentId: string) {
  const [tenant, unpaidBills] = await Promise.all([
    getTenantProfile(tenantId, apartmentId),
    prisma.bill.findMany({
      where: { tenantId, apartmentId, status: BillStatus.SENT },
      orderBy: [{ billingPeriod: "desc" }, { issuedAt: "desc" }],
      select: {
        id: true,
        billingPeriod: true,
        totalAmount: true,
        issuedAt: true,
        dueDate: true,
        status: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            kind: true,
            calculationType: true,
            quantity: true,
            unitPrice: true,
            amount: true,
          },
        },
      },
    }),
  ]);
  return {
    tenant,
    // Keep currentBill during the API transition for older clients.
    currentBill: unpaidBills[0] ? publicBill(unpaidBills[0]) : null,
    unpaidBills: unpaidBills.map(publicBill),
    totalUnpaid: unpaidBills.reduce((total, bill) => total + decimal(bill.totalAmount), 0),
  };
}

function publicBill<T extends {
  totalAmount: Prisma.Decimal;
  items: Array<{ quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; amount: Prisma.Decimal }>;
}>(bill: T) {
  return {
      ...bill,
      totalAmount: decimal(bill.totalAmount),
      items: bill.items.map((item) => ({
        ...item,
        quantity: decimal(item.quantity),
        unitPrice: decimal(item.unitPrice),
        amount: decimal(item.amount),
      })),
    };
}

export async function getPaymentHistory(tenantId: string, apartmentId: string) {
  const bills = await prisma.bill.findMany({
    where: { tenantId, apartmentId, status: BillStatus.PAID },
    orderBy: [{ paidAt: "desc" }, { billingPeriod: "desc" }],
    select: {
      id: true,
      billingPeriod: true,
      totalAmount: true,
      issuedAt: true,
      dueDate: true,
      paidAt: true,
      status: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, quantity: true, unitPrice: true, amount: true },
      },
    },
  });
  return bills.map((bill) => ({
    ...bill,
    totalAmount: decimal(bill.totalAmount),
    items: bill.items.map((item) => ({
      ...item,
      quantity: decimal(item.quantity),
      unitPrice: decimal(item.unitPrice),
      amount: decimal(item.amount),
    })),
  }));
}

export async function getApartmentContacts(apartmentId: string) {
  return prisma.apartmentContact.findMany({
    where: { apartmentId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      contactName: true,
      channel: true,
      value: true,
      note: true,
    },
  });
}
