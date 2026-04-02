import crypto from "node:crypto";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";
import {
  countAdmins,
  createAdmin,
  createAdminSession,
  deleteAdminSessionByTokenHash,
  deleteExpiredAdminSessions,
  getAdminByUsername,
  getAdminSessionByTokenHash,
  touchAdminSession,
} from "./auth.repository";
import type { AuthBootstrapStatus, SessionView } from "./auth.types";

export const AUTH_COOKIE_NAME = "operator_studio_session";
const SESSION_TTL_DAYS = 14;

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function plusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function validateUsername(username: string) {
  const clean = username.trim();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(clean)) {
    throw new ValidationError("username 需为 3-32 位字母、数字、下划线或横杠");
  }
  return clean;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new ValidationError("password 至少 8 位");
  }
  return password;
}

export async function getBootstrapStatus(token?: string | null): Promise<AuthBootstrapStatus> {
  const adminCount = await countAdmins();
  const hasSession = token ? Boolean(await getSessionFromToken(token)) : false;
  const session = token ? await getSessionFromToken(token) : null;
  return {
    requiresSetup: adminCount === 0,
    hasSession,
    username: session?.username,
  };
}

export async function bootstrapAdmin(input: { username: string; password: string; userAgent?: string | null }) {
  if (await countAdmins() > 0) {
    throw new ConflictError("管理员已存在，请直接登录");
  }
  const username = validateUsername(input.username);
  const password = validatePassword(input.password);
  const now = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const admin = await createAdmin({
    username,
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  });
  return createSessionForAdmin(admin.id, admin.username, input.userAgent ?? null);
}

async function createSessionForAdmin(adminId: string, username: string, userAgent: string | null) {
  const now = new Date().toISOString();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = plusDays(SESSION_TTL_DAYS);
  await createAdminSession({
    adminId,
    tokenHash: tokenHash(rawToken),
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
    userAgent,
  });
  return {
    token: rawToken,
    session: {
      username,
      expiresAt,
    } satisfies SessionView,
  };
}

export async function loginAdmin(input: { username: string; password: string; userAgent?: string | null }) {
  const username = validateUsername(input.username);
  const password = validatePassword(input.password);
  const admin = await getAdminByUsername(username);
  if (!admin) throw new UnauthorizedError("用户名或密码错误");
  const hashed = hashPassword(password, admin.passwordSalt);
  if (hashed !== admin.passwordHash) {
    throw new UnauthorizedError("用户名或密码错误");
  }
  return createSessionForAdmin(admin.id, admin.username, input.userAgent ?? null);
}

export async function getSessionFromToken(token?: string | null): Promise<SessionView | null> {
  if (!token) return null;
  const now = new Date().toISOString();
  await deleteExpiredAdminSessions(now);
  const session = await getAdminSessionByTokenHash(tokenHash(token));
  if (!session) return null;
  if (session.expiresAt <= now) {
    await deleteAdminSessionByTokenHash(tokenHash(token));
    return null;
  }
  const expiresAt = plusDays(SESSION_TTL_DAYS);
  await touchAdminSession(session.id, now, expiresAt);
  return {
    username: session.username,
    expiresAt,
  };
}

export async function requireSessionFromToken(token?: string | null): Promise<SessionView> {
  const session = await getSessionFromToken(token);
  if (!session) throw new UnauthorizedError("请先登录 Operator Studio");
  return session;
}

export async function logoutByToken(token?: string | null) {
  if (!token) return;
  await deleteAdminSessionByTokenHash(tokenHash(token));
}
