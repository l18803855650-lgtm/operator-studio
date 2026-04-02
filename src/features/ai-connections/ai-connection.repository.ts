import crypto from "node:crypto";
import { getDb } from "@/lib/sqlite";
import { decryptSecret, encryptSecret, redactSecret } from "@/lib/secrets";
import type { AiConnectionRecord, AiConnectionSecretRecord, CreateAiConnectionInput } from "./ai-connection.types";

type AiConnectionRow = {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key_encrypted: string;
  model: string;
  notes?: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: AiConnectionRow): AiConnectionRecord {
  const apiKey = decryptSecret(row.api_key_encrypted);
  return {
    id: row.id,
    name: row.name,
    provider: "openai-compatible",
    baseUrl: row.base_url,
    model: row.model,
    apiKeyPreview: redactSecret(apiKey),
    notes: row.notes ?? null,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowWithSecret(row: AiConnectionRow): AiConnectionSecretRecord {
  const apiKey = decryptSecret(row.api_key_encrypted);
  return {
    ...mapRow(row),
    apiKey,
  };
}

export async function listAiConnectionRecords(): Promise<AiConnectionRecord[]> {
  const db = await getDb();
  const rows = db.prepare(`SELECT * FROM ai_connections ORDER BY updated_at DESC, created_at DESC`).all() as AiConnectionRow[];
  return rows.map(mapRow);
}

export async function getAiConnectionRecordById(id: string): Promise<AiConnectionRecord | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM ai_connections WHERE id = ?`).get(id) as AiConnectionRow | undefined;
  return row ? mapRow(row) : undefined;
}

export async function getAiConnectionSecretRecordById(id: string): Promise<AiConnectionSecretRecord | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM ai_connections WHERE id = ?`).get(id) as AiConnectionRow | undefined;
  return row ? mapRowWithSecret(row) : undefined;
}

export async function createAiConnectionRecord(input: CreateAiConnectionInput & { createdAt: string; updatedAt: string }): Promise<AiConnectionRecord> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const encrypted = encryptSecret(input.apiKey);
  db.prepare(`
    INSERT INTO ai_connections (
      id, name, provider, base_url, api_key_encrypted, model, notes, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    "openai-compatible",
    input.baseUrl,
    encrypted,
    input.model,
    input.notes ?? null,
    input.enabled === false ? 0 : 1,
    input.createdAt,
    input.updatedAt,
  );
  return {
    id,
    name: input.name,
    provider: "openai-compatible",
    baseUrl: input.baseUrl,
    model: input.model,
    apiKeyPreview: redactSecret(input.apiKey),
    notes: input.notes ?? null,
    enabled: input.enabled !== false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export async function deleteAiConnectionRecord(id: string): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM ai_connections WHERE id = ?`).run(id);
}
