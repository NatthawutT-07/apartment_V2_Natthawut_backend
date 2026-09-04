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

export function getLineEncryptionKey(): Buffer {
  const value = process.env.LINE_CONFIG_ENCRYPTION_KEY;
  if (!value) throw new Error("LINE_CONFIG_ENCRYPTION_KEY is required to manage LINE settings");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("LINE_CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

export type LineEnvironmentConfig = {
  managedByEnvironment: true;
  configured: boolean;
  missingEnvironmentVariables: string[];
  oaBasicId: string;
  messagingChannelId: string;
  messagingChannelSecret: string;
  messagingAccessToken: string;
  loginChannelId: string;
  loginChannelSecret: string;
  apiBaseUrl: string;
  frontendBaseUrl: string;
  isActive: boolean;
};

export function getLineEnvironmentConfig(): LineEnvironmentConfig | null {
  if ((process.env.LINE_CONFIG_SOURCE ?? "").trim().toLowerCase() !== "env") return null;

  const values = {
    oaBasicId: process.env.LINE_OA_BASIC_ID?.trim() ?? "",
    messagingChannelId: process.env.LINE_MESSAGING_CHANNEL_ID?.trim() ?? "",
    messagingChannelSecret: process.env.LINE_MESSAGING_CHANNEL_SECRET?.trim() ?? "",
    messagingAccessToken: process.env.LINE_MESSAGING_ACCESS_TOKEN?.trim() ?? "",
    loginChannelId: process.env.LINE_LOGIN_CHANNEL_ID?.trim() ?? "",
    loginChannelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET?.trim() ?? "",
    apiBaseUrl: process.env.LINE_PUBLIC_API_BASE_URL?.trim() ?? "",
    frontendBaseUrl: process.env.LINE_FRONTEND_BASE_URL?.trim() ?? "",
  };
  const variableByField: Record<keyof typeof values, string> = {
    oaBasicId: "LINE_OA_BASIC_ID",
    messagingChannelId: "LINE_MESSAGING_CHANNEL_ID",
    messagingChannelSecret: "LINE_MESSAGING_CHANNEL_SECRET",
    messagingAccessToken: "LINE_MESSAGING_ACCESS_TOKEN",
    loginChannelId: "LINE_LOGIN_CHANNEL_ID",
    loginChannelSecret: "LINE_LOGIN_CHANNEL_SECRET",
    apiBaseUrl: "LINE_PUBLIC_API_BASE_URL",
    frontendBaseUrl: "LINE_FRONTEND_BASE_URL",
  };
  const missingEnvironmentVariables = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([field]) => variableByField[field as keyof typeof values]);
  const configured = missingEnvironmentVariables.length === 0;

  return {
    managedByEnvironment: true,
    configured,
    missingEnvironmentVariables,
    ...values,
    isActive: configured && (process.env.LINE_OA_ACTIVE ?? "true").trim().toLowerCase() === "true",
  };
}
