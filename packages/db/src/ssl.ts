import type { PoolConfig } from "pg";

const disabledValues = new Set(["false", "0", "disable", "disabled", "off"]);
const enabledValues = new Set(["true", "1", "require", "required", "on"]);

export function getDatabaseSslConfig(
  isDevelopment: boolean,
): PoolConfig["ssl"] {
  const databaseSsl = process.env.DATABASE_SSL?.trim().toLowerCase();

  if (databaseSsl && disabledValues.has(databaseSsl)) {
    return false;
  }

  if (databaseSsl && enabledValues.has(databaseSsl)) {
    return {
      rejectUnauthorized:
        process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    };
  }

  return isDevelopment ? false : { rejectUnauthorized: false };
}
