export interface GovernanceSettings {
  defaultLifecycle: "temporary" | "persistent";
  workerPollIntervalMs: number;
  maxConcurrentRuns: number;
  dailyRunBudget: number;
  artifactRetentionDays: number;
  persistentRequiresConfirmation: boolean;
  visualVerificationRequired: boolean;
  browserDefaultModel: string;
  mediaDefaultModel: string;
  factoryDefaultModel: string;
}

export interface GovernanceStatus {
  settings: GovernanceSettings;
  worker: {
    status: "unknown" | "healthy" | "stale";
    heartbeatAt?: string;
    ageSeconds?: number;
    meta?: Record<string, unknown> | null;
  };
}
