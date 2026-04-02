import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "@/lib/config";

const secretFilePath = path.join(config.dataDir, "operator-studio.secret");
let cachedKey: Buffer | null = null;

function deriveKeyFromEnv(value: string) {
  return crypto.createHash("sha256").update(value).digest();
}

function readOrCreateLocalKey() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(secretFilePath)) {
    const raw = fs.readFileSync(secretFilePath, "utf8").trim();
    if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    if (/^[A-Za-z0-9+/=]+$/.test(raw)) return Buffer.from(raw, "base64");
    return deriveKeyFromEnv(raw);
  }
  const next = crypto.randomBytes(32);
  fs.writeFileSync(secretFilePath, next.toString("hex"), { mode: 0o600 });
  return next;
}

function getSecretKey() {
  if (cachedKey) return cachedKey;
  cachedKey = process.env.OPERATOR_SECRET_KEY ? deriveKeyFromEnv(process.env.OPERATOR_SECRET_KEY) : readOrCreateLocalKey();
  return cachedKey;
}

export function encryptSecret(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const body = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export function redactSecret(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
