import { getDb, getDefaultGovernanceSettings } from "@/lib/sqlite";
import type { GovernanceSettings } from "./governance.types";

interface WorkerHeartbeatRow {
  heartbeat_at?: string;
  status?: string;
  meta_json?: string;
}

export async function getGovernanceSettingsRecord(): Promise<GovernanceSettings> {
  const db = await getDb();
  const row = db.prepare(`SELECT value_json FROM governance_settings WHERE setting_key = ?`).get("global") as
    | { value_json?: string }
    | undefined;
  if (!row?.value_json) return getDefaultGovernanceSettings();
  return { ...getDefaultGovernanceSettings(), ...(JSON.parse(row.value_json) as Partial<GovernanceSettings>) };
}

export async function patchGovernanceSettingsRecord(patch: Partial<GovernanceSettings>): Promise<GovernanceSettings> {
  const db = await getDb();
  const current = await getGovernanceSettingsRecord();
  const next = { ...current, ...patch };
  db.prepare(`UPDATE governance_settings SET value_json = ?, updated_at = ? WHERE setting_key = ?`).run(
    JSON.stringify(next),
    new Date().toISOString(),
    "global",
  );
  return next;
}

export async function getWorkerHeartbeatRecord() {
  const db = await getDb();
  const row = db.prepare(`SELECT heartbeat_at, status, meta_json FROM worker_heartbeats WHERE worker_name = ?`).get("main-worker") as WorkerHeartbeatRow | undefined;
  return row
    ? {
        heartbeatAt: row.heartbeat_at,
        status: row.status,
        meta: row.meta_json ? (JSON.parse(row.meta_json) as Record<string, unknown>) : null,
      }
    : null;
}
