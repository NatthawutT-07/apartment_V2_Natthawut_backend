import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Role } from "../generated/prisma/client.js";
import { getJwtExpiresInSeconds, getJwtSecret } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";

const PASSWORD_HASH_ROUNDS = 12;
const INVALID_CREDENTIALS = "Invalid username or password";
// Comparing against a real hash when no account exists makes invalid-account and
// invalid-password requests take approximately the same amount of work.
const DUMMY_PASSWORD_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.3fLQ5J5G9lM0wG8QwQzQJmXyYGYQBOa";

export type AccountType = "ADMIN" | "TENANT";

type ApartmentSummary = {
  id: string;
  name: string;
  slug: string;
};

type TokenUser = {
  id: string;
  accountType: AccountType;
  role: Role;
  apartmentId: string | null;
};

export type AuthIdentity = {
  userId: string;
  accountType: AccountType;
  role: Role;
  apartmentId?: string;
};

const adminSelect = {
  id: true,
  username: true,
  phone: true,
  role: true,
  mustChangePassword: true,
  isActive: true,
  apartments: {
    where: { apartment: { isActive: true } },
    orderBy: { isPrimary: "desc" as const },
    select: {
      isPrimary: true,
      apartment: { select: { id: true, name: true, slug: true } },
    },
  },
} as const;

const tenantSelect = {
  id: true,
  username: true,
  phone: true,
  apartmentId: true,
  mustChangePassword: true,
  isActive: true,
  apartment: { select: { id: true, name: true, slug: true, isActive: true } },
} as const;

function createAccessToken(user: TokenUser): string {
  return jwt.sign(
    {
      userId: user.id,
      accountType: user.accountType,
      role: user.role,
      ...(user.apartmentId ? { apartmentId: user.apartmentId } : {}),
    },
    getJwtSecret(),
    { algorithm: "HS256", expiresIn: getJwtExpiresInSeconds() },
  );
}

function publicAdmin(
  admin: {
    id: string;
    username: string;
    phone: string | null;
    role: Role;
    mustChangePassword: boolean;
    apartments: Array<{ apartment: ApartmentSummary }>;
  },
  activeApartmentId?: string,
) {
  const apartments = admin.apartments.map(({ apartment }) => apartment);
  const activeApartment = activeApartmentId
    ? apartments.find((apartment) => apartment.id === activeApartmentId)
    : apartments[0];

  return {
    id: admin.id,
    username: admin.username,
    phone: admin.phone,
    role: admin.role,
    accountType: "ADMIN" as const,
    apartmentId: activeApartment?.id ?? null,
    apartmentName: activeApartment?.name ?? null,
    apartments,
    mustChangePassword: admin.mustChangePassword,
  };
}

function publicTenant(tenant: {
  id: string;
  username: string;
  phone: string | null;
  apartmentId: string;
  mustChangePassword: boolean;
  apartment: ApartmentSummary;
}) {
  return {
    id: tenant.id,
    username: tenant.username,
    phone: tenant.phone,
    role: Role.TENANT,
    accountType: "TENANT" as const,
    apartmentId: tenant.apartmentId,
    apartmentName: tenant.apartment.name,
    apartments: [tenant.apartment],
    mustChangePassword: tenant.mustChangePassword,
  };
}

async function passwordMatches(password: string, passwordHash?: string) {
  return bcrypt.compare(password, passwordHash ?? DUMMY_PASSWORD_HASH);
}

export async function loginAdmin(username: string, password: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { username },
    select: { ...adminSelect, passwordHash: true },
  });

  const hasApartmentAccess =
    admin?.role === Role.SUPER_ADMIN ||
    (admin?.role === Role.APARTMENT_ADMIN && Boolean(admin.apartments.length));
  const matches = await passwordMatches(password, admin?.passwordHash);

  if (!admin?.isActive || !hasApartmentAccess || !matches) {
    throw new AppError(401, INVALID_CREDENTIALS);
  }

  const user = publicAdmin(admin);
  return {
    accessToken: createAccessToken({ ...user, id: admin.id }),
    user,
  };
}

export async function loginTenant(
  apartmentCode: string,
  username: string,
  password: string,
) {
  const apartment = await prisma.apartment.findFirst({
    where: {
      isActive: true,
      OR: [{ slug: apartmentCode }, { subdomain: apartmentCode }],
    },
    select: { id: true },
  });

  const tenant = apartment
    ? await prisma.tenantUser.findUnique({
        where: {
          apartmentId_username: { apartmentId: apartment.id, username },
        },
        select: { ...tenantSelect, passwordHash: true },
      })
    : null;
  const matches = await passwordMatches(password, tenant?.passwordHash);

  if (!tenant?.isActive || !tenant.apartment.isActive || !matches) {
    throw new AppError(401, INVALID_CREDENTIALS);
  }

  const user = publicTenant(tenant);
  return {
    accessToken: createAccessToken({ ...user, id: tenant.id }),
    user,
  };
}

export async function getCurrentUser(identity: AuthIdentity) {
  if (identity.accountType === "ADMIN") {
    const admin = await prisma.adminUser.findUnique({
      where: { id: identity.userId },
      select: adminSelect,
    });

    if (!admin?.isActive || admin.role !== identity.role) {
      throw new AppError(404, "User not found");
    }

    if (
      identity.apartmentId &&
      !admin.apartments.some(({ apartment }) => apartment.id === identity.apartmentId)
    ) {
      throw new AppError(403, "Apartment access is no longer available");
    }

    return publicAdmin(admin, identity.apartmentId);
  }

  const tenant = await prisma.tenantUser.findUnique({
    where: { id: identity.userId },
    select: tenantSelect,
  });

  if (
    !tenant?.isActive ||
    !tenant.apartment.isActive ||
    identity.role !== Role.TENANT ||
    tenant.apartmentId !== identity.apartmentId
  ) {
    throw new AppError(404, "User not found");
  }

  return publicTenant(tenant);
}

export async function switchAdminApartment(identity: AuthIdentity, apartmentId: string) {
  if (identity.accountType !== "ADMIN" || identity.role !== Role.APARTMENT_ADMIN) {
    throw new AppError(403, "Forbidden");
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: identity.userId },
    select: adminSelect,
  });

  if (
    !admin?.isActive ||
    !admin.apartments.some(({ apartment }) => apartment.id === apartmentId)
  ) {
    throw new AppError(403, "Apartment access is not available");
  }

  const user = publicAdmin(admin, apartmentId);
  return {
    accessToken: createAccessToken({ ...user, id: admin.id }),
    user,
  };
}

export async function changePassword(
  identity: AuthIdentity,
  currentPassword: string,
  newPassword: string,
) {
  const account =
    identity.accountType === "ADMIN"
      ? await prisma.adminUser.findUnique({
          where: { id: identity.userId },
          select: { passwordHash: true },
        })
      : await prisma.tenantUser.findUnique({
          where: { id: identity.userId },
          select: { passwordHash: true },
        });

  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new AppError(400, "Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
  if (identity.accountType === "ADMIN") {
    await prisma.adminUser.update({
      where: { id: identity.userId },
      data: { passwordHash, mustChangePassword: false },
    });
  } else {
    await prisma.tenantUser.update({
      where: { id: identity.userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }
}
