import bcrypt from "bcrypt";
import { Prisma, Role } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { CreateApartmentAdminInput } from "../validation/superadmin.validation.js";

const PASSWORD_HASH_ROUNDS = 12;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

function startOfDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function endOfDate(date: string) {
  return new Date(`${date}T23:59:59.999Z`);
}

function accessPeriod(accessStartsAt: Date, accessEndsAt: Date) {
  const now = new Date();
  const accessStatus = now < accessStartsAt
    ? "SCHEDULED"
    : now > accessEndsAt
      ? "EXPIRED"
      : "ACTIVE";

  return {
    accessStartsAt,
    accessEndsAt,
    accessStatus,
    remainingDays: Math.max(
      0,
      Math.ceil((accessEndsAt.getTime() - now.getTime()) / MILLISECONDS_PER_DAY),
    ),
  };
}

export async function getApartmentPortfolio() {
  const apartments = await prisma.apartment.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      totalRooms: true,
      isActive: true,
      createdAt: true,
      adminUsers: {
        where: { adminUser: { role: Role.APARTMENT_ADMIN } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          isPrimary: true,
          accessStartsAt: true,
          accessEndsAt: true,
          adminUser: {
            select: {
              id: true,
              username: true,
              fullName: true,
              phone: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  const apartmentRows = apartments.map(({ adminUsers, ...apartment }) => ({
    ...apartment,
    admins: adminUsers.map(({ adminUser, isPrimary, accessStartsAt, accessEndsAt }) => ({
      ...adminUser,
      isPrimary,
      ...accessPeriod(accessStartsAt, accessEndsAt),
    })),
  }));

  return {
    summary: {
      totalApartments: apartmentRows.length,
      activeApartments: apartmentRows.filter((apartment) => apartment.isActive).length,
      inactiveApartments: apartmentRows.filter((apartment) => !apartment.isActive).length,
      totalRooms: apartmentRows.reduce((total, apartment) => total + apartment.totalRooms, 0),
      totalAdmins: apartmentRows.reduce(
        (total, apartment) => total + apartment.admins.length,
        0,
      ),
    },
    apartments: apartmentRows,
  };
}

export async function createApartmentAdmin(input: CreateApartmentAdminInput) {
  const passwordHash = await bcrypt.hash(input.temporaryPassword, PASSWORD_HASH_ROUNDS);

  try {
    return await prisma.$transaction(async (transaction) => {
      const [existingAdmin, existingApartment] = await Promise.all([
        transaction.adminUser.findUnique({
          where: { username: input.adminUsername },
          select: { id: true },
        }),
        transaction.apartment.findFirst({
          where: {
            OR: [
              { slug: input.apartmentCode },
              { subdomain: input.apartmentCode },
            ],
          },
          select: { id: true },
        }),
      ]);

      if (existingAdmin) {
        throw new AppError(409, "Admin username is already in use");
      }
      if (existingApartment) {
        throw new AppError(409, "Apartment code is already in use");
      }

      const apartment = await transaction.apartment.create({
        data: {
          name: input.apartmentName,
          slug: input.apartmentCode,
          subdomain: input.apartmentCode,
          totalRooms: input.totalRooms,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          totalRooms: true,
          isActive: true,
          createdAt: true,
        },
      });

      const roomNumberWidth = Math.max(3, String(input.totalRooms).length);
      await transaction.room.createMany({
        data: Array.from({ length: input.totalRooms }, (_, index) => ({
          apartmentId: apartment.id,
          roomNumber: String(index + 1).padStart(roomNumberWidth, "0"),
        })),
      });

      const admin = await transaction.adminUser.create({
        data: {
          username: input.adminUsername,
          fullName: input.adminFullName,
          phone: input.adminPhone,
          passwordHash,
          role: Role.APARTMENT_ADMIN,
          mustChangePassword: true,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
        },
      });

      const assignment = await transaction.adminApartment.create({
        data: {
          adminUserId: admin.id,
          apartmentId: apartment.id,
          isPrimary: true,
          accessStartsAt: startOfDate(input.accessStartDate),
          accessEndsAt: endOfDate(input.accessEndDate),
        },
        select: {
          isPrimary: true,
          accessStartsAt: true,
          accessEndsAt: true,
        },
      });

      return {
        apartment,
        admin: {
          ...admin,
          ...assignment,
          ...accessPeriod(assignment.accessStartsAt, assignment.accessEndsAt),
        },
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Admin username or apartment code is already in use");
    }
    throw error;
  }
}

export async function updateApartmentAdminStatus(adminId: string, isActive: boolean) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, role: true },
  });

  if (!admin || admin.role !== Role.APARTMENT_ADMIN) {
    throw new AppError(404, "Apartment admin not found");
  }

  return prisma.adminUser.update({
    where: { id: adminId },
    data: { isActive },
    select: {
      id: true,
      username: true,
      fullName: true,
      isActive: true,
    },
  });
}

export async function adjustApartmentAdminAccess(
  apartmentId: string,
  adminId: string,
  days: number,
) {
  const assignment = await prisma.adminApartment.findUnique({
    where: {
      adminUserId_apartmentId: {
        adminUserId: adminId,
        apartmentId,
      },
    },
    select: {
      accessStartsAt: true,
      accessEndsAt: true,
      adminUser: { select: { role: true } },
    },
  });

  if (!assignment || assignment.adminUser.role !== Role.APARTMENT_ADMIN) {
    throw new AppError(404, "Apartment admin assignment not found");
  }

  const accessEndsAt = new Date(
    assignment.accessEndsAt.getTime() + days * MILLISECONDS_PER_DAY,
  );

  if (accessEndsAt < assignment.accessStartsAt) {
    throw new AppError(400, "Access end date cannot be before the start date");
  }

  const updated = await prisma.adminApartment.update({
    where: {
      adminUserId_apartmentId: {
        adminUserId: adminId,
        apartmentId,
      },
    },
    data: { accessEndsAt },
    select: {
      accessStartsAt: true,
      accessEndsAt: true,
    },
  });

  return accessPeriod(updated.accessStartsAt, updated.accessEndsAt);
}

export async function getAdminApartmentRooms(apartmentId: string, adminId: string) {
  const assignment = await prisma.adminApartment.findUnique({
    where: {
      adminUserId_apartmentId: {
        adminUserId: adminId,
        apartmentId,
      },
    },
    select: {
      adminUser: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      apartment: {
        select: {
          id: true,
          name: true,
          slug: true,
          rooms: {
            where: { isActive: true },
            orderBy: { roomNumber: "asc" },
            select: {
              id: true,
              roomNumber: true,
              isPlaceholder: true,
            },
          },
          tenants: {
            select: {
              id: true,
              username: true,
              fullName: true,
              roomNumber: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!assignment || assignment.adminUser.role !== Role.APARTMENT_ADMIN) {
    throw new AppError(404, "Apartment admin assignment not found");
  }

  const tenantByRoom = new Map(
    assignment.apartment.tenants.map((tenant) => [tenant.roomNumber, tenant]),
  );
  const rooms = assignment.apartment.rooms.map((room) => {
    const tenant = tenantByRoom.get(room.roomNumber) ?? null;
    return {
      ...room,
      status: tenant ? "OCCUPIED" as const : "AVAILABLE" as const,
      tenant,
    };
  });
  const occupiedRooms = rooms.filter((room) => room.status === "OCCUPIED").length;

  return {
    apartment: {
      id: assignment.apartment.id,
      name: assignment.apartment.name,
      slug: assignment.apartment.slug,
    },
    admin: assignment.adminUser,
    summary: {
      totalRooms: rooms.length,
      occupiedRooms,
      availableRooms: rooms.length - occupiedRooms,
    },
    rooms,
  };
}
