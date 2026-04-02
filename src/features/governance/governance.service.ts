import { ValidationError } from "@/lib/errors";
import { getGovernanceSettingsRecord, getWorkerHeartbeatRecord, patchGovernanceSettingsRecord } from "./governance.repository";
import type { GovernanceSettings, GovernanceStatus } from "./governance.types";

export async function getGovernanceStatus(): Promise<GovernanceStatus> {
  const [settings, heartbeat] = await Promise.all([
    getGovernanceSettingsRecord(),
    getWorkerHeartbeatRecord(),
  ]);

  if (!heartbeat?.heartbeatAt) {
    return {
      settings,
      worker: { status: "unknown" },
    };
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(heartbeat.heartbeatAt).getTime()) / 1000));
  return {
    settings,
    worker: {
      status: ageSeconds <= 10 ? "healthy" : "stale",
      heartbeatAt: heartbeat.heartbeatAt,
      ageSeconds,
      meta: heartbeat.meta,
    },
  };
}

export async function updateGovernanceSettings(patch: Partial<GovernanceSettings>): Promise<GovernanceStatus> {
  if (patch.workerPollIntervalMs !== undefined && patch.workerPollIntervalMs < 500) {
    throw new ValidationError("workerPollIntervalMs must be >= 500");
  }
  if (patch.maxConcurrentRuns !== undefined && patch.maxConcurrentRuns < 1) {
    throw new ValidationError("maxConcurrentRuns must be >= 1");
  }
  if (patch.dailyRunBudget !== undefined && patch.dailyRunBudget < 1) {
    throw new ValidationError("dailyRunBudget must be >= 1");
  }

  await patchGovernanceSettingsRecord(patch);
  return getGovernanceStatus();
}
