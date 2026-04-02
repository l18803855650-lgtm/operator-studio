import crypto from "node:crypto";
import { getDb } from "@/lib/sqlite";
import type { AdminRecord, AdminSessionRecord } from "./auth.types";

type AdminRow = {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  admin_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  user_agent?: string | null;
};

function mapAdmin(row: AdminRow): AdminRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSession(row: SessionRow): AdminSessionRecord {
  return {
    id: row.id,
    adminId: row.admin_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    userAgent: row.user_agent ?? null,
  };
}

export async function countAdmins(): Promise<number> {
  const db = await getDb();
  const row = db.prepare(`SELECT COUNT(*) as count FROM admin_users`).get() as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

export async function getAdminByUsername(username: string): Promise<AdminRecord | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM admin_users WHERE username = ?`).get(username) as AdminRow | undefined;
  return row ? mapAdmin(row) : undefined;
}

export async function createAdmin(input: Pick<AdminRecord, "username" | "passwordHash" | "passwordSalt" | "createdAt" | "updatedAt">): Promise<AdminRecord> {
  const db = await getDb();
  const admin: AdminRecord = {
    id: crypto.randomUUID(),
    username: input.username,
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  db.prepare(`
    INSERT INTO admin_users (id, username, password_hash, password_salt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(admin.id, admin.username, admin.passwordHash, admin.passwordSalt, admin.createdAt, admin.updatedAt);
  return admin;
}

export async function createAdminSession(input: Pick<AdminSessionRecord, "adminId" | "tokenHash" | "createdAt" | "expiresAt" | "lastSeenAt" | "userAgent">): Promise<AdminSessionRecord> {
  const db = await getDb();
  const session: AdminSessionRecord = {
    id: crypto.randomUUID(),
    adminId: input.adminId,
    tokenHash: input.tokenHash,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    lastSeenAt: input.lastSeenAt,
    userAgent: input.userAgent ?? null,
  };
  db.prepare(`
    INSERT INTO admin_sessions (id, admin_id, token_hash, created_at, expires_at, last_seen_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(session.id, session.adminId, session.tokenHash, session.createdAt, session.expiresAt, session.lastSeenAt, session.userAgent ?? null);
  return session;
}

export async function getAdminSessionByTokenHash(tokenHash: string): Promise<(AdminSessionRecord & { username: string }) | undefined> {
  const db = await getDb();
  const row = db.prepare(`
    SELECT s.*, a.username
    FROM admin_sessions s
    JOIN admin_users a ON a.id = s.admin_id
    WHERE s.token_hash = ?
  `).get(tokenHash) as (SessionRow & { username: string }) | undefined;
  if (!row) return undefined;
  return {
    ...mapSession(row),
    username: row.username,
  };
}

export async function touchAdminSession(id: string, nowIso: string, expiresAt: string): Promise<void> {
  const db = await getDb();
  db.prepare(`UPDATE admin_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`).run(nowIso, expiresAt, id);
}

export async function deleteAdminSessionByTokenHash(tokenHash: string): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).run(tokenHash);
}

export async function deleteExpiredAdminSessions(nowIso: string): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM admin_sessions WHERE expires_at <= ?`).run(nowIso);
}
