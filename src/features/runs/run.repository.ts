import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, getDefaultGovernanceSettings } from "@/lib/sqlite";
import { config } from "@/lib/config";
import type { CreateArtifactInput, RunArtifact, RunEvent, RunRecord, RunRecordStep } from "./run.types";

interface RunRow {
  id: string;
  trace_id: string;
  template_id: string;
  template_name: string;
  title: string;
  goal: string;
  target: string;
  created_at: string;
  lifecycle: RunRecord["lifecycle"];
  desired_state: RunRecord["desiredState"];
  status: RunRecord["status"];
  progress_percent: number;
  started_at?: string;
  updated_at: string;
  completed_at?: string;
  current_step_index?: number;
  live_summary: string;
  labels_json: string;
  operator_notes_json: string;
  default_model: string;
  fallback_model: string;
  verification: string;
  executor_type?: string;
  execution_mode?: RunRecord["executionMode"];
  execution_input_json?: string;
  execution_summary_json?: string;
}

interface RunStepRow {
  run_id: string;
  step_index: number;
  step_id: string;
  title: string;
  description: string;
  duration_sec: number;
  tool_hint: string;
  evidence_hint: string;
  status: RunRecordStep["status"];
  started_at?: string;
  finished_at?: string;
}

interface RunEventRow {
  id: string;
  run_id: string;
  created_at: string;
  level: RunEvent["level"];
  event_type: string;
  message: string;
  payload_json?: string;
}

interface RunArtifactRow {
  id: string;
  run_id: string;
  created_at: string;
  kind: RunArtifact["kind"];
  label: string;
  file_path: string;
  content_type?: string;
  metadata_json?: string;
}

function mapStepRow(row: RunStepRow): RunRecordStep {
  return {
    id: row.step_id,
    title: row.title,
    description: row.description,
    durationSec: row.duration_sec,
    toolHint: row.tool_hint,
    evidenceHint: row.evidence_hint,
    status: row.status ?? "pending",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function parseJson<T>(value?: string, fallback: T | null = null): T | null {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRunRow(row: RunRow, stepRows: RunStepRow[]): RunRecord {
  return {
    id: row.id,
    traceId: row.trace_id,
    templateId: row.template_id,
    templateName: row.template_name,
    title: row.title,
    goal: row.goal,
    target: row.target,
    createdAt: row.created_at,
    lifecycle: row.lifecycle,
    desiredState: row.desired_state,
    status: row.status ?? "queued",
    progressPercent: Number(row.progress_percent ?? 0),
    startedAt: row.started_at,
    updatedAt: row.updated_at ?? row.created_at,
    completedAt: row.completed_at,
    currentStepIndex: row.current_step_index ?? undefined,
    liveSummary: row.live_summary ?? "Queued for worker",
    labels: parseJson<string[]>(row.labels_json, []) ?? [],
    operatorNotes: parseJson<string[]>(row.operator_notes_json, []) ?? [],
    modelPolicy: {
      defaultModel: row.default_model,
      fallbackModel: row.fallback_model,
      verification: row.verification,
    },
    executorType: row.executor_type ?? "simulated-template",
    executionMode: row.execution_mode ?? "simulated",
    executionInput: parseJson<Record<string, unknown>>(row.execution_input_json),
    executionSummary: parseJson<Record<string, unknown>>(row.execution_summary_json),
    steps: stepRows.sort((a, b) => a.step_index - b.step_index).map(mapStepRow),
  };
}

function mapEventRow(row: RunEventRow): RunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    createdAt: row.created_at,
    level: row.level,
    eventType: row.event_type,
    message: row.message,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : null,
  };
}

function mapArtifactRow(row: RunArtifactRow): RunArtifact {
  return {
    id: row.id,
    runId: row.run_id,
    createdAt: row.created_at,
    kind: row.kind,
    label: row.label,
    filePath: row.file_path,
    contentType: row.content_type,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
  };
}

export async function listRunRecords(): Promise<RunRecord[]> {
  const db = await getDb();
  const runRows = db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all() as unknown as RunRow[];
  const stepRows = db.prepare(`SELECT * FROM run_steps ORDER BY run_id, step_index ASC`).all() as unknown as RunStepRow[];
  return runRows.map((row) => mapRunRow(row, stepRows.filter((step) => step.run_id === row.id)));
}

export async function getRunRecordById(id: string): Promise<RunRecord | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as unknown as RunRow | undefined;
  if (!row) return undefined;
  const stepRows = db.prepare(`SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index ASC`).all(id) as unknown as RunStepRow[];
  return mapRunRow(row, stepRows);
}

export async function saveRunRecord(record: RunRecord): Promise<void> {
  const db = await getDb();
  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT OR REPLACE INTO runs (
        id, trace_id, template_id, template_name, title, goal, target, created_at,
        lifecycle, desired_state, status, progress_percent, started_at, updated_at,
        completed_at, current_step_index, live_summary, labels_json, operator_notes_json,
        default_model, fallback_model, verification, executor_type, execution_mode,
        execution_input_json, execution_summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.traceId,
      record.templateId,
      record.templateName,
      record.title,
      record.goal,
      record.target,
      record.createdAt,
      record.lifecycle,
      record.desiredState,
      record.status,
      record.progressPercent,
      record.startedAt ?? null,
      record.updatedAt,
      record.completedAt ?? null,
      record.currentStepIndex ?? null,
      record.liveSummary,
      JSON.stringify(record.labels),
      JSON.stringify(record.operatorNotes),
      record.modelPolicy.defaultModel,
      record.modelPolicy.fallbackModel,
      record.modelPolicy.verification,
      record.executorType,
      record.executionMode,
      record.executionInput ? JSON.stringify(record.executionInput) : null,
      record.executionSummary ? JSON.stringify(record.executionSummary) : null,
    );

    db.prepare(`DELETE FROM run_steps WHERE run_id = ?`).run(record.id);
    const stepStmt = db.prepare(`
      INSERT INTO run_steps (
        run_id, step_index, step_id, title, description, duration_sec, tool_hint, evidence_hint,
        status, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    record.steps.forEach((step, index) => {
      stepStmt.run(
        record.id,
        index,
        step.id,
        step.title,
        step.description,
        step.durationSec,
        step.toolHint,
        step.evidenceHint,
        step.status,
        step.startedAt ?? null,
        step.finishedAt ?? null,
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function listRunEvents(runId: string, limit = 200): Promise<RunEvent[]> {
  const db = await getDb();
  const rows = db.prepare(`SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at DESC LIMIT ?`).all(runId, limit) as unknown as RunEventRow[];
  return rows.map(mapEventRow);
}

export async function recordRunEvent(input: Omit<RunEvent, "id"> & { id?: string }): Promise<RunEvent> {
  const db = await getDb();
  const event: RunEvent = {
    id: input.id ?? crypto.randomUUID(),
    runId: input.runId,
    createdAt: input.createdAt,
    level: input.level,
    eventType: input.eventType,
    message: input.message,
    payload: input.payload ?? null,
  };
  db.prepare(`
    INSERT INTO run_events (id, run_id, created_at, level, event_type, message, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.runId,
    event.createdAt,
    event.level,
    event.eventType,
    event.message,
    event.payload ? JSON.stringify(event.payload) : null,
  );
  return event;
}

export async function listRunArtifacts(runId: string): Promise<RunArtifact[]> {
  const db = await getDb();
  const rows = db.prepare(`SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY created_at DESC`).all(runId) as unknown as RunArtifactRow[];
  return rows.map(mapArtifactRow);
}

export async function getRunArtifact(runId: string, artifactId: string): Promise<RunArtifact | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM run_artifacts WHERE run_id = ? AND id = ?`).get(runId, artifactId) as unknown as RunArtifactRow | undefined;
  return row ? mapArtifactRow(row) : undefined;
}

export async function createArtifact(input: CreateArtifactInput): Promise<RunArtifact> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const dir = path.join(config.dataDir, "artifacts", input.runId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  fs.writeFileSync(filePath, input.bytes);
  db.prepare(`
    INSERT INTO run_artifacts (id, run_id, created_at, kind, label, file_path, content_type, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.runId,
    createdAt,
    input.kind,
    input.label,
    filePath,
    input.contentType ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
  return {
    id,
    runId: input.runId,
    createdAt,
    kind: input.kind,
    label: input.label,
    filePath,
    contentType: input.contentType,
    metadata: input.metadata ?? null,
  };
}

export async function countRunEvents(runId: string): Promise<number> {
  const db = await getDb();
  const row = db.prepare(`SELECT COUNT(*) as count FROM run_events WHERE run_id = ?`).get(runId) as { count: number };
  return row?.count ?? 0;
}

export async function countRunArtifacts(runId: string): Promise<number> {
  const db = await getDb();
  const row = db.prepare(`SELECT COUNT(*) as count FROM run_artifacts WHERE run_id = ?`).get(runId) as { count: number };
  return row?.count ?? 0;
}

export function applyGovernanceModelPolicy(domain: string, modelPolicy: RunRecord["modelPolicy"]) {
  const settings = getDefaultGovernanceSettings();
  if (domain === "browser") {
    return { ...modelPolicy, defaultModel: settings.browserDefaultModel };
  }
  if (domain === "media") {
    return { ...modelPolicy, defaultModel: settings.mediaDefaultModel };
  }
  if (domain === "manufacturing") {
    return { ...modelPolicy, defaultModel: settings.factoryDefaultModel };
  }
  return modelPolicy;
}
