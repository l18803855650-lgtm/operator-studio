import { NotFoundError, ValidationError } from "@/lib/errors";
import { getGovernanceSettings, updateGovernanceSettings } from "@/features/governance/governance.service";
import { createAiConnectionRecord, deleteAiConnectionRecord, getAiConnectionRecordById, getAiConnectionSecretRecordById, listAiConnectionRecords } from "./ai-connection.repository";
import type { AiConnectionRecord, AiConnectionSecretRecord, CreateAiConnectionInput } from "./ai-connection.types";

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    throw new ValidationError("baseUrl 必须是 http/https 地址，例如 https://api.openai.com/v1");
  }
  return normalized;
}

export async function listAiConnections(): Promise<AiConnectionRecord[]> {
  return listAiConnectionRecords();
}

export async function getAiConnection(connectionId: string): Promise<AiConnectionRecord> {
  const record = await getAiConnectionRecordById(connectionId);
  if (!record) throw new NotFoundError("AiConnection", connectionId);
  return record;
}

export async function getAiConnectionSecret(connectionId: string): Promise<AiConnectionSecretRecord> {
  const record = await getAiConnectionSecretRecordById(connectionId);
  if (!record) throw new NotFoundError("AiConnection", connectionId);
  return record;
}

export async function createAiConnection(input: CreateAiConnectionInput): Promise<AiConnectionRecord> {
  const name = input.name?.trim();
  const model = input.model?.trim();
  const apiKey = input.apiKey?.trim();
  if (!name || name.length < 2) throw new ValidationError("连接名称至少 2 个字符");
  if (!model) throw new ValidationError("必须填写模型名，例如 gpt-4.1-mini / glm-4.6v-flash");
  if (!apiKey || apiKey.length < 8) throw new ValidationError("API Key 看起来不完整");
  const now = new Date().toISOString();
  return createAiConnectionRecord({
    name,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    apiKey,
    model,
    notes: input.notes?.trim() || undefined,
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteAiConnection(connectionId: string): Promise<void> {
  await getAiConnection(connectionId);
  const governance = await getGovernanceSettings();
  if (governance.defaultAiConnectionId === connectionId) {
    await updateGovernanceSettings({ defaultAiConnectionId: null });
  }
  await deleteAiConnectionRecord(connectionId);
}
