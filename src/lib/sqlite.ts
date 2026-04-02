import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { readJsonFile } from "@/lib/fs-store";
import type { GovernanceSettings } from "@/features/governance/governance.types";
import type { RunRecord } from "@/features/runs/run.types";

type SqliteRow = Record<string, unknown>;

type SqliteStatement = {
  run: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => SqliteRow | undefined;
  all: (...args: unknown[]) => SqliteRow[];
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

declare global {
  // eslint-disable-next-line no-var
  var __operatorStudioDb: SqliteDatabase | undefined;
}

const SQLITE_BOOTSTRAP = Symbol.for("operator-studio.sqlite.bootstrap");
type GlobalWithBootstrap = typeof globalThis & {
  [SQLITE_BOOTSTRAP]?: boolean;
};

type LegacyStep = {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  toolHint: string;
  evidenceHint: string;
};

type LegacyRunRecord = Omit<
  RunRecord,
  | "status"
  | "progressPercent"
  | "updatedAt"
  | "liveSummary"
  | "steps"
  | "startedAt"
  | "completedAt"
  | "currentStepIndex"
  | "executorType"
  | "executionMode"
  | "executionInput"
  | "executionSummary"
> & {
  steps: LegacyStep[];
};

interface LegacyRunsDb {
  runs: LegacyRunRecord[];
}

const DEFAULT_GOVERNANCE_SETTINGS: GovernanceSettings = {
  defaultLifecycle: "persistent",
  workerPollIntervalMs: 1200,
  maxConcurrentRuns: 3,
  dailyRunBudget: 50,
  artifactRetentionDays: 14,
  persistentRequiresConfirmation: true,
  visualVerificationRequired: true,
  browserDefaultModel: "openai-codex/gpt-5.4",
  mediaDefaultModel: "minimax/MiniMax-M2.7-highspeed",
  factoryDefaultModel: "openai-codex/gpt-5.4",
  defaultAiConnectionId: null,
};

export function getDefaultGovernanceSettings(): GovernanceSettings {
  return DEFAULT_GOVERNANCE_SETTINGS;
}

function rowCount(db: SqliteDatabase, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function getColumns(db: SqliteDatabase, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.map((row) => String(row.name ?? ""));
}

function ensureColumn(db: SqliteDatabase, table: string, column: string, definition: string) {
  if (!getColumns(db, table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function inferLegacyExecutor(templateId: string) {
  if (templateId.startsWith("browser")) return { executorType: "browser-playwright", executionMode: "real" as const };
  if (templateId.startsWith("media")) return { executorType: "media-pipeline", executionMode: "real" as const };
  if (templateId.startsWith("factory")) return { executorType: "factory-audit-pipeline", executionMode: "real" as const };
  return { executorType: "simulated-template", executionMode: "simulated" as const };
}

function insertLegacyRunRecord(db: SqliteDatabase, record: LegacyRunRecord) {
  const now = new Date().toISOString();
  const legacyExecutor = inferLegacyExecutor(record.templateId);
  db.prepare(`
    INSERT OR REPLACE INTO runs (
      id, trace_id, template_id, template_name, title, goal, target, created_at,
      lifecycle, desired_state, status, progress_percent, started_at, updated_at, completed_at,
      current_step_index, live_summary, labels_json, operator_notes_json,
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
    record.desiredState === "stopped" ? "stopped" : "queued",
    0,
    null,
    now,
    null,
    null,
    "Queued for worker",
    JSON.stringify(record.labels),
    JSON.stringify(record.operatorNotes),
    record.modelPolicy.defaultModel,
    record.modelPolicy.fallbackModel,
    record.modelPolicy.verification,
    legacyExecutor.executorType,
    legacyExecutor.executionMode,
    null,
    null,
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
      "pending",
      null,
      null,
    );
  });
}

async function bootstrapFromLegacyJson(db: SqliteDatabase) {
  const legacyPath = path.join(config.dataDir, "runs.json");
  if (!fs.existsSync(legacyPath)) return;
  if (rowCount(db, "runs") > 0) return;

  const legacy = await readJsonFile<LegacyRunsDb>(legacyPath, { runs: [] });
  if (!legacy.runs.length) return;

  db.exec("BEGIN");
  try {
    for (const record of legacy.runs) {
      insertLegacyRunRecord(db, record);
    }
    db.exec("COMMIT");
    logger.info("SQLite bootstrap migrated legacy runs.json", {
      count: legacy.runs.length,
      dbPath: config.dbPath,
    });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedGovernance(db: SqliteDatabase) {
  const existing = db.prepare(`SELECT value_json FROM governance_settings WHERE setting_key = ?`).get("global");
  if (!existing) {
    db.prepare(`INSERT INTO governance_settings (setting_key, value_json, updated_at) VALUES (?, ?, ?)`)
      .run("global", JSON.stringify(DEFAULT_GOVERNANCE_SETTINGS), new Date().toISOString());
  }
}

async function initializeDatabase(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL UNIQUE,
      template_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      target TEXT NOT NULL,
      created_at TEXT NOT NULL,
      lifecycle TEXT NOT NULL,
      desired_state TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      operator_notes_json TEXT NOT NULL,
      default_model TEXT NOT NULL,
      fallback_model TEXT NOT NULL,
      verification TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_steps (
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      step_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      tool_hint TEXT NOT NULL,
      evidence_hint TEXT NOT NULL,
      PRIMARY KEY (run_id, step_index),
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content_type TEXT,
      metadata_json TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS governance_settings (
      setting_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_name TEXT PRIMARY KEY,
      heartbeat_at TEXT NOT NULL,
      status TEXT NOT NULL,
      meta_json TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      user_agent TEXT,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      storage_state_path TEXT,
      headers_json TEXT,
      cookies_json TEXT,
      basic_auth_json TEXT,
      locale TEXT,
      user_agent TEXT,
      secrets_json TEXT,
      totp_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL,
      notes TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "runs", "status", "TEXT");
  ensureColumn(db, "runs", "progress_percent", "INTEGER");
  ensureColumn(db, "runs", "started_at", "TEXT");
  ensureColumn(db, "runs", "updated_at", "TEXT");
  ensureColumn(db, "runs", "completed_at", "TEXT");
  ensureColumn(db, "runs", "current_step_index", "INTEGER");
  ensureColumn(db, "runs", "live_summary", "TEXT");
  ensureColumn(db, "runs", "executor_type", "TEXT");
  ensureColumn(db, "runs", "execution_mode", "TEXT");
  ensureColumn(db, "runs", "execution_input_json", "TEXT");
  ensureColumn(db, "runs", "execution_summary_json", "TEXT");

  ensureColumn(db, "run_steps", "status", "TEXT");
  ensureColumn(db, "run_steps", "started_at", "TEXT");
  ensureColumn(db, "run_steps", "finished_at", "TEXT");

  ensureColumn(db, "browser_profiles", "secrets_json", "TEXT");
  ensureColumn(db, "browser_profiles", "totp_json", "TEXT");
  ensureColumn(db, "ai_connections", "notes", "TEXT");
  ensureColumn(db, "ai_connections", "enabled", "INTEGER NOT NULL DEFAULT 1");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_template_id ON runs(template_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, desired_state, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id, step_index);
    CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_browser_profiles_updated_at ON browser_profiles(updated_at DESC);

    UPDATE runs
    SET status = COALESCE(NULLIF(status, ''), CASE WHEN desired_state = 'stopped' THEN 'stopped' ELSE 'queued' END),
        progress_percent = COALESCE(progress_percent, 0),
        updated_at = COALESCE(updated_at, created_at),
        live_summary = COALESCE(NULLIF(live_summary, ''), 'Queued for worker'),
        executor_type = COALESCE(NULLIF(executor_type, ''), CASE
          WHEN template_id LIKE 'browser%' THEN 'browser-playwright'
          WHEN template_id LIKE 'media%' THEN 'media-pipeline'
          WHEN template_id LIKE 'factory%' THEN 'factory-audit-pipeline'
          ELSE 'simulated-template'
        END),
        execution_mode = COALESCE(NULLIF(execution_mode, ''), CASE
          WHEN template_id LIKE 'browser%' THEN 'real'
          WHEN template_id LIKE 'media%' THEN 'real'
          WHEN template_id LIKE 'factory%' THEN 'real'
          ELSE 'simulated'
        END);

    UPDATE run_steps
    SET status = COALESCE(NULLIF(status, ''), 'pending');
  `);

  seedGovernance(db);
  await bootstrapFromLegacyJson(db);
}

export async function getDb(): Promise<SqliteDatabase> {
  if (!global.__operatorStudioDb) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    global.__operatorStudioDb = new DatabaseSync(config.dbPath);
    global.__operatorStudioDb.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }

  const marker = globalThis as GlobalWithBootstrap;
  if (!marker[SQLITE_BOOTSTRAP]) {
    await initializeDatabase(global.__operatorStudioDb);
    marker[SQLITE_BOOTSTRAP] = true;
  }

  return global.__operatorStudioDb;
}

export async function getDbMeta() {
  const db = await getDb();
  const worker = db.prepare(`SELECT heartbeat_at, status, meta_json FROM worker_heartbeats WHERE worker_name = ?`).get("main-worker") as
    | { heartbeat_at?: string; status?: string; meta_json?: string }
    | undefined;

  return {
    path: config.dbPath,
    runsCount: rowCount(db, "runs"),
    eventsCount: rowCount(db, "run_events"),
    artifactsCount: rowCount(db, "run_artifacts"),
    worker: worker
      ? {
          heartbeatAt: worker.heartbeat_at,
          status: worker.status,
          meta: worker.meta_json ? JSON.parse(worker.meta_json) : null,
        }
      : null,
  };
}
