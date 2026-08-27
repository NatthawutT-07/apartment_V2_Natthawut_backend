export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }
  return value;
}

export function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  return value;
}

export function getJwtExpiresInSeconds(): number {
  const raw = process.env.JWT_EXPIRES_IN ?? "1h";
  const match = /^(\d+)(s|m|h|d)?$/.exec(raw);

  if (!match) {
    throw new Error("JWT_EXPIRES_IN must be a number followed by s, m, h, or d");
  }

  const amount = Number(match[1]);
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  const unit = (match[2] ?? "s") as keyof typeof multipliers;
  const multiplier = multipliers[unit];
  const seconds = amount * multiplier;

  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error("JWT_EXPIRES_IN must be a positive duration");
  }

  return seconds;
}
