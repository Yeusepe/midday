import { afterEach, beforeEach, expect, test } from "bun:test";
import { getDatabaseSslConfig } from "./ssl";

const originalSsl = process.env.DATABASE_SSL;
const originalReject = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
beforeEach(() => {
  delete process.env.DATABASE_SSL;
  delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
});
afterEach(() => {
  if (originalSsl === undefined) delete process.env.DATABASE_SSL;
  else process.env.DATABASE_SSL = originalSsl;
  if (originalReject === undefined)
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  else process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = originalReject;
});

test("production verifies database certificates by default", () => {
  expect(getDatabaseSslConfig(false)).toEqual({ rejectUnauthorized: true });
});
test("an unrecognized production SSL setting keeps certificate verification", () => {
  process.env.DATABASE_SSL = "misspelled";
  expect(getDatabaseSslConfig(false)).toEqual({ rejectUnauthorized: true });
});
test("development keeps its local database default", () => {
  expect(getDatabaseSslConfig(true)).toBe(false);
});
test("explicit private-network SSL disabling is honored", () => {
  process.env.DATABASE_SSL = "false";
  expect(getDatabaseSslConfig(false)).toBe(false);
});
test("explicit TLS verifies the database certificate", () => {
  process.env.DATABASE_SSL = "require";
  expect(getDatabaseSslConfig(false)).toEqual({ rejectUnauthorized: true });
});
