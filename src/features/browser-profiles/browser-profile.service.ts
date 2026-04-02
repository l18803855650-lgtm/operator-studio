import path from "node:path";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  createBrowserProfileRecord,
  deleteBrowserProfileRecord,
  getBrowserProfileRecordById,
  listBrowserProfileRecords,
  updateBrowserProfileRecord,
} from "./browser-profile.repository";
import type { BrowserProfileRecord, BrowserTotpConfig, CreateBrowserProfileInput } from "./browser-profile.types";

function normalizeHeaders(headers?: Record<string, string>) {
  if (!headers) return null;
  const entries = Object.entries(headers).filter((entry) => typeof entry[1] === "string" && entry[0].trim());
  return entries.length > 0 ? Object.fromEntries(entries.map(([key, value]) => [key.trim(), value.trim()])) : null;
}

function normalizeCookies(cookies?: Record<string, unknown>[]) {
  if (!Array.isArray(cookies)) return null;
  const next = cookies.filter((item) => item && typeof item === "object");
  return next.length > 0 ? next : null;
}

function normalizeSecrets(secrets?: Record<string, string>) {
  if (!secrets || typeof secrets !== "object" || Array.isArray(secrets)) return null;
  const entries = Object.entries(secrets)
    .filter((entry) => typeof entry[1] === "string" && entry[0].trim())
    .map(([key, value]) => [key.trim(), value]);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeTotp(totp?: BrowserTotpConfig) {
  if (!totp || typeof totp !== "object") return null;
  const secret = typeof totp.secret === "string" ? totp.secret.trim().replace(/\s+/g, "") : "";
  if (!secret) return null;
  const digits = typeof totp.digits === "number" ? Math.max(6, Math.min(8, Math.trunc(totp.digits))) : 6;
  const period = typeof totp.period === "number" ? Math.max(15, Math.min(120, Math.trunc(totp.period))) : 30;
  const algorithm = typeof totp.algorithm === "string" && totp.algorithm.trim() ? totp.algorithm.trim().toUpperCase() : "SHA1";
  if (!["SHA1", "SHA256", "SHA512"].includes(algorithm)) {
    throw new ValidationError("totp.algorithm 只支持 SHA1 / SHA256 / SHA512");
  }
  return {
    secret,
    issuer: typeof totp.issuer === "string" && totp.issuer.trim() ? totp.issuer.trim() : undefined,
    accountName: typeof totp.accountName === "string" && totp.accountName.trim() ? totp.accountName.trim() : undefined,
    digits,
    period,
    algorithm,
  } satisfies BrowserTotpConfig;
}

function validateInput(input: CreateBrowserProfileInput) {
  const name = input.name?.trim();
  if (!name || name.length < 2) {
    throw new ValidationError("profile name 至少 2 个字符");
  }
  const storageStatePath = input.storageStatePath?.trim();
  if (storageStatePath && !path.isAbsolute(storageStatePath)) {
    throw new ValidationError("storageStatePath 必须是绝对路径");
  }
  return {
    name,
    description: input.description?.trim() || undefined,
    storageStatePath: storageStatePath || undefined,
    headers: normalizeHeaders(input.headers) || undefined,
    cookies: normalizeCookies(input.cookies) || undefined,
    basicAuth: input.basicAuth && typeof input.basicAuth.username === "string" ? {
      username: input.basicAuth.username,
      password: input.basicAuth.password,
    } : undefined,
    locale: input.locale?.trim() || undefined,
    userAgent: input.userAgent?.trim() || undefined,
    secrets: normalizeSecrets(input.secrets) || undefined,
    totp: normalizeTotp(input.totp) || undefined,
  } satisfies CreateBrowserProfileInput;
}

export async function listBrowserProfiles(): Promise<BrowserProfileRecord[]> {
  return listBrowserProfileRecords();
}

export async function getBrowserProfile(profileId: string): Promise<BrowserProfileRecord> {
  const record = await getBrowserProfileRecordById(profileId);
  if (!record) throw new NotFoundError("BrowserProfile", profileId);
  return record;
}

export async function createBrowserProfile(input: CreateBrowserProfileInput): Promise<BrowserProfileRecord> {
  const clean = validateInput(input);
  const now = new Date().toISOString();
  return createBrowserProfileRecord({
    ...clean,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateBrowserProfile(profileId: string, input: CreateBrowserProfileInput): Promise<BrowserProfileRecord> {
  await getBrowserProfile(profileId);
  const clean = validateInput(input);
  await updateBrowserProfileRecord(profileId, {
    ...clean,
    updatedAt: new Date().toISOString(),
  });
  return getBrowserProfile(profileId);
}

export async function deleteBrowserProfile(profileId: string): Promise<void> {
  await getBrowserProfile(profileId);
  await deleteBrowserProfileRecord(profileId);
}
