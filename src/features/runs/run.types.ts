import type { ExecutionTemplate, TemplateStep } from "@/features/templates/template.types";

export type RunLifecycle = "temporary" | "persistent";
export type RunDesiredState = "active" | "stopped";
export type RunStatus = "queued" | "running" | "completed" | "attention" | "stopped";
export type RunStepStatus = "pending" | "running" | "completed" | "attention" | "stopped";
export type RunEventLevel = "info" | "warn" | "error";
export type ArtifactKind = "evidence" | "upload" | "log" | "replay" | "output";
export type RunExecutionMode = "real" | "simulated";

export interface RunRecordStep extends TemplateStep {
  status: RunStepStatus;
  startedAt?: string;
  finishedAt?: string;
}

export interface RunExecutionSummary {
  lastArtifactLabels?: string[];
  realArtifactsCount?: number;
  notes?: string[];
  replayPath?: string;
  latestOutputPath?: string;
  latestLogPath?: string;
  lastError?: string;
  [key: string]: unknown;
}

export interface RunRecord {
  id: string;
  traceId: string;
  templateId: string;
  templateName: string;
  title: string;
  goal: string;
  target: string;
  createdAt: string;
  lifecycle: RunLifecycle;
  desiredState: RunDesiredState;
  status: RunStatus;
  progressPercent: number;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  currentStepIndex?: number;
  liveSummary: string;
  labels: string[];
  operatorNotes: string[];
  modelPolicy: ExecutionTemplate["modelPolicy"];
  executorType: string;
  executionMode: RunExecutionMode;
  executionInput?: Record<string, unknown> | null;
  executionSummary?: RunExecutionSummary | null;
  steps: RunRecordStep[];
}

export interface RunEvent {
  id: string;
  runId: string;
  createdAt: string;
  level: RunEventLevel;
  eventType: string;
  message: string;
  payload?: Record<string, unknown> | null;
}

export interface RunArtifact {
  id: string;
  runId: string;
  createdAt: string;
  kind: ArtifactKind;
  label: string;
  filePath: string;
  contentType?: string;
  metadata?: Record<string, unknown> | null;
}

export interface RunInsight {
  assistantSummary: string;
  nextAction: string;
  riskFlags: string[];
  attentionReason?: string;
  currentStepTitle?: string;
}

export interface RunView extends RunRecord, RunInsight {
  replayHints: string[];
  eventsCount: number;
  artifactsCount: number;
}

export interface RunDetailView extends RunView {
  events: RunEvent[];
  artifacts: RunArtifact[];
}

export interface CreateRunInput {
  templateId: string;
  target: string;
  lifecycle?: RunLifecycle;
  title?: string;
  operatorNote?: string;
  executionInput?: string | Record<string, unknown> | null;
}

export interface CreateArtifactInput {
  runId: string;
  kind: ArtifactKind;
  label: string;
  fileName: string;
  contentType?: string;
  bytes: Buffer;
  metadata?: Record<string, unknown> | null;
}
