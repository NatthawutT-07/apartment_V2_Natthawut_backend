import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/client.js";
import { getJwtExpiresInSeconds, getJwtSecret } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";

const PASSWORD_HASH_ROUNDS = 12;
const INVALID_CREDENTIALS = "Invalid username or password";

const publicUserSelect = {
  id: true,
  username: true,
  phone: true,
  role: true,
  apartmentId: true,
  mustChangePassword: true,
} as const;

type TokenUser = {
  id: string;
  role: Role;
  apartmentId: string | null;
};

function createAccessToken(user: TokenUser): string {
  const payload = {
    userId: user.id,
    role: user.role,
    ...(user.apartmentId ? { apartmentId: user.apartmentId } : {}),
  };

  return jwt.sign(payload, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: getJwtExpiresInSeconds(),
  });
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      ...publicUserSelect,
      passwordHash: true,
      isActive: true,
      apartment: { select: { isActive: true } },
    },
  });

  const apartmentIsValid =
    user?.role === "SUPER_ADMIN" ||
    (Boolean(user?.apartmentId) && user?.apartment?.isActive === true);

  if (!user?.isActive || !apartmentIsValid) {
    throw new AppError(401, INVALID_CREDENTIALS);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, INVALID_CREDENTIALS);
  }

  const { passwordHash: _passwordHash, isActive: _isActive, apartment: _apartment, ...safeUser } = user;

  return {
    accessToken: createAccessToken(user),
    user: safeUser,
  };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, "Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });
}

