import crypto from "node:crypto";
import { getDb } from "@/lib/sqlite";
import type { BrowserProfileRecord, BrowserTotpConfig, CreateBrowserProfileInput } from "./browser-profile.types";

type BrowserProfileRow = {
  id: string;
  name: string;
  description?: string | null;
  storage_state_path?: string | null;
  headers_json?: string | null;
  cookies_json?: string | null;
  basic_auth_json?: string | null;
  locale?: string | null;
  user_agent?: string | null;
  secrets_json?: string | null;
  totp_json?: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value?: string | null, fallback: T | null = null): T | null {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: BrowserProfileRow): BrowserProfileRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    storageStatePath: row.storage_state_path ?? null,
    headers: parseJson<Record<string, string>>(row.headers_json, null),
    cookies: parseJson<Record<string, unknown>[]>(row.cookies_json, null),
    basicAuth: parseJson<{ username: string; password: string }>(row.basic_auth_json, null),
    locale: row.locale ?? null,
    userAgent: row.user_agent ?? null,
    secrets: parseJson<Record<string, string>>(row.secrets_json, null),
    totp: parseJson<BrowserTotpConfig>(row.totp_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBrowserProfileRecords(): Promise<BrowserProfileRecord[]> {
  const db = await getDb();
  const rows = db.prepare(`SELECT * FROM browser_profiles ORDER BY updated_at DESC, created_at DESC`).all() as BrowserProfileRow[];
  return rows.map(mapRow);
}

export async function getBrowserProfileRecordById(id: string): Promise<BrowserProfileRecord | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM browser_profiles WHERE id = ?`).get(id) as BrowserProfileRow | undefined;
  return row ? mapRow(row) : undefined;
}

export async function createBrowserProfileRecord(input: CreateBrowserProfileInput & { createdAt: string; updatedAt: string }): Promise<BrowserProfileRecord> {
  const db = await getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO browser_profiles (
      id, name, description, storage_state_path, headers_json, cookies_json, basic_auth_json, locale, user_agent, secrets_json, totp_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description ?? null,
    input.storageStatePath ?? null,
    input.headers ? JSON.stringify(input.headers) : null,
    input.cookies ? JSON.stringify(input.cookies) : null,
    input.basicAuth ? JSON.stringify(input.basicAuth) : null,
    input.locale ?? null,
    input.userAgent ?? null,
    input.secrets ? JSON.stringify(input.secrets) : null,
    input.totp ? JSON.stringify(input.totp) : null,
    input.createdAt,
    input.updatedAt,
  );
  return mapRow({
    id,
    name: input.name,
    description: input.description ?? null,
    storage_state_path: input.storageStatePath ?? null,
    headers_json: input.headers ? JSON.stringify(input.headers) : null,
    cookies_json: input.cookies ? JSON.stringify(input.cookies) : null,
    basic_auth_json: input.basicAuth ? JSON.stringify(input.basicAuth) : null,
    locale: input.locale ?? null,
    user_agent: input.userAgent ?? null,
    secrets_json: input.secrets ? JSON.stringify(input.secrets) : null,
    totp_json: input.totp ? JSON.stringify(input.totp) : null,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  });
}

export async function updateBrowserProfileRecord(id: string, input: CreateBrowserProfileInput & { updatedAt: string }): Promise<void> {
  const db = await getDb();
  db.prepare(`
    UPDATE browser_profiles
    SET name = ?, description = ?, storage_state_path = ?, headers_json = ?, cookies_json = ?, basic_auth_json = ?, locale = ?, user_agent = ?, secrets_json = ?, totp_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name,
    input.description ?? null,
    input.storageStatePath ?? null,
    input.headers ? JSON.stringify(input.headers) : null,
    input.cookies ? JSON.stringify(input.cookies) : null,
    input.basicAuth ? JSON.stringify(input.basicAuth) : null,
    input.locale ?? null,
    input.userAgent ?? null,
    input.secrets ? JSON.stringify(input.secrets) : null,
    input.totp ? JSON.stringify(input.totp) : null,
    input.updatedAt,
    id,
  );
}

export async function deleteBrowserProfileRecord(id: string): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM browser_profiles WHERE id = ?`).run(id);
}
