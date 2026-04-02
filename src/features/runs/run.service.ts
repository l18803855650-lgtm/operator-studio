import crypto from "node:crypto";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getTemplateById } from "@/features/templates/template.repository";
import { getBrowserProfile } from "@/features/browser-profiles/browser-profile.service";
import { getGovernanceSettingsRecord } from "@/features/governance/governance.repository";
import {
  countRunArtifacts,
  countRunEvents,
  createArtifact,
  getRunArtifact,
  getRunRecordById,
  listRunArtifacts,
  listRunEvents,
  listRunRecords,
  recordRunEvent,
  saveRunRecord,
} from "./run.repository";
import { materializeRunView } from "./run.runtime";
import type { CreateArtifactInput, CreateRunInput, RunArtifact, RunDetailView, RunRecord, RunView } from "./run.types";

function parseExecutionInput(input: CreateRunInput["executionInput"]): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new ValidationError("executionInput must be valid JSON");
    }
  }
  return input;
}

async function mergeBrowserCredentialProfile(templateId: string, rawInput: Record<string, unknown> | null) {
  if (templateId !== "browser-operator") return rawInput;
  if (!rawInput || typeof rawInput !== "object") return rawInput;
  const credentialProfileId = typeof rawInput.credentialProfileId === "string" ? rawInput.credentialProfileId.trim() : "";
  if (!credentialProfileId) return rawInput;
  const profile = await getBrowserProfile(credentialProfileId);
  return {
    ...(profile.headers ? { extraHeaders: profile.headers } : {}),
    ...(profile.cookies ? { cookies: profile.cookies } : {}),
    ...(profile.basicAuth ? { basicAuth: profile.basicAuth } : {}),
    ...(profile.locale ? { locale: profile.locale } : {}),
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    ...(profile.storageStatePath ? { storageStatePath: profile.storageStatePath } : {}),
    ...(profile.secrets ? { secrets: profile.secrets } : {}),
    ...(profile.totp ? { totp: profile.totp } : {}),
    ...rawInput,
    credentialProfileId,
  } satisfies Record<string, unknown>;
}

function inferExecutor(templateId: string) {
  if (templateId === "browser-operator") {
    return { executorType: "browser-playwright", executionMode: "real" as const };
  }
  if (templateId === "media-agent") {
    return { executorType: "media-pipeline", executionMode: "real" as const };
  }
  if (templateId === "factory-audit") {
    return { executorType: "factory-audit-pipeline", executionMode: "real" as const };
  }
  return { executorType: "simulated-template", executionMode: "simulated" as const };
}

function normalizeExecutionInput(templateId: string, target: string, rawInput: Record<string, unknown> | null) {
  const next = { ...(rawInput ?? {}) };
  if (templateId === "browser-operator") {
    const url = typeof next.url === "string" && next.url.trim()
      ? next.url.trim()
      : /^https?:\/\//i.test(target)
        ? target.trim()
        : "";
    if (!url) {
      throw new ValidationError("browser run 需要 executionInput.url（http/https）");
    }

    const extraHeaders = next.extraHeaders && typeof next.extraHeaders === "object" && !Array.isArray(next.extraHeaders)
      ? Object.fromEntries(
        Object.entries(next.extraHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

    const cookies = Array.isArray(next.cookies)
      ? next.cookies.filter((item) => item && typeof item === "object")
      : [];

    const viewport = next.viewport && typeof next.viewport === "object" && !Array.isArray(next.viewport)
      ? {
        width: typeof (next.viewport as { width?: unknown }).width === "number" ? (next.viewport as { width: number }).width : 1440,
        height: typeof (next.viewport as { height?: unknown }).height === "number" ? (next.viewport as { height: number }).height : 1600,
      }
      : undefined;

    const basicAuth = next.basicAuth && typeof next.basicAuth === "object" && !Array.isArray(next.basicAuth)
      ? {
        username: typeof (next.basicAuth as { username?: unknown }).username === "string" ? (next.basicAuth as { username: string }).username : "",
        password: typeof (next.basicAuth as { password?: unknown }).password === "string" ? (next.basicAuth as { password: string }).password : "",
      }
      : undefined;

    const secrets = next.secrets && typeof next.secrets === "object" && !Array.isArray(next.secrets)
      ? Object.fromEntries(
        Object.entries(next.secrets).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

    const totp = next.totp && typeof next.totp === "object" && !Array.isArray(next.totp)
      ? {
        secret: typeof (next.totp as { secret?: unknown }).secret === "string" ? (next.totp as { secret: string }).secret : "",
        issuer: typeof (next.totp as { issuer?: unknown }).issuer === "string" ? (next.totp as { issuer: string }).issuer : undefined,
        accountName: typeof (next.totp as { accountName?: unknown }).accountName === "string" ? (next.totp as { accountName: string }).accountName : undefined,
        digits: typeof (next.totp as { digits?: unknown }).digits === "number" ? (next.totp as { digits: number }).digits : undefined,
        period: typeof (next.totp as { period?: unknown }).period === "number" ? (next.totp as { period: number }).period : undefined,
        algorithm: typeof (next.totp as { algorithm?: unknown }).algorithm === "string" ? (next.totp as { algorithm: string }).algorithm : undefined,
      }
      : undefined;

    return {
      url,
      waitUntil: typeof next.waitUntil === "string" ? next.waitUntil : "networkidle",
      timeoutMs: typeof next.timeoutMs === "number" ? next.timeoutMs : 30000,
      captureHtml: next.captureHtml !== false,
      captureScreenshot: next.captureScreenshot !== false,
      actions: Array.isArray(next.actions) ? next.actions : [],
      storageStatePath: typeof next.storageStatePath === "string" ? next.storageStatePath : undefined,
      saveStorageState: next.saveStorageState === true,
      persistProfileStorageState: next.persistProfileStorageState === true,
      extraHeaders,
      cookies,
      viewport,
      locale: typeof next.locale === "string" ? next.locale : undefined,
      userAgent: typeof next.userAgent === "string" ? next.userAgent : undefined,
      basicAuth,
      secrets,
      totp,
      credentialProfileId: typeof next.credentialProfileId === "string" ? next.credentialProfileId : undefined,
      note: typeof next.note === "string" ? next.note : undefined,
    } satisfies Record<string, unknown>;
  }

  if (templateId === "media-agent") {
    const source = typeof next.source === "string" && next.source.trim()
      ? next.source.trim()
      : (/^(https?:\/\/|\/)/i.test(target) ? target.trim() : "");
    if (!source) {
      throw new ValidationError("media run 需要 executionInput.source（URL 或本地绝对路径）");
    }

    const deliveryWebhookHeaders = next.deliveryWebhookHeaders && typeof next.deliveryWebhookHeaders === "object" && !Array.isArray(next.deliveryWebhookHeaders)
      ? Object.fromEntries(
        Object.entries(next.deliveryWebhookHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

    const sourceHeaders = next.sourceHeaders && typeof next.sourceHeaders === "object" && !Array.isArray(next.sourceHeaders)
      ? Object.fromEntries(
        Object.entries(next.sourceHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

    const sourceCookies = Array.isArray(next.sourceCookies)
      ? next.sourceCookies.filter((item) => item && typeof item === "object")
      : [];

    return {
      source,
      archiveName: typeof next.archiveName === "string" ? next.archiveName : undefined,
      extractFrame: next.extractFrame !== false,
      deliveryDir: typeof next.deliveryDir === "string" ? next.deliveryDir : undefined,
      deliveryWebhookUrl: typeof next.deliveryWebhookUrl === "string" ? next.deliveryWebhookUrl : undefined,
      deliveryWebhookHeaders,
      deliveryWebhookRetries: typeof next.deliveryWebhookRetries === "number" ? next.deliveryWebhookRetries : 2,
      deliveryWebhookBackoffMs: typeof next.deliveryWebhookBackoffMs === "number" ? next.deliveryWebhookBackoffMs : 600,
      sourceHeaders,
      sourceCookies,
      sourceUserAgent: typeof next.sourceUserAgent === "string" ? next.sourceUserAgent : undefined,
      sourceRetries: typeof next.sourceRetries === "number" ? next.sourceRetries : 2,
      sourceBackoffMs: typeof next.sourceBackoffMs === "number" ? next.sourceBackoffMs : 600,
      emitChecksums: next.emitChecksums !== false,
      note: typeof next.note === "string" ? next.note : undefined,
    } satisfies Record<string, unknown>;
  }

  if (templateId === "factory-audit") {
    const evidenceFiles = Array.isArray(next.evidenceFiles)
      ? next.evidenceFiles
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
      : [];

    const visionWebhookHeaders = next.visionWebhookHeaders && typeof next.visionWebhookHeaders === "object" && !Array.isArray(next.visionWebhookHeaders)
      ? Object.fromEntries(
        Object.entries(next.visionWebhookHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

    const visionBatchWebhookHeaders = next.visionBatchWebhookHeaders && typeof next.visionBatchWebhookHeaders === "object" && !Array.isArray(next.visionBatchWebhookHeaders)
      ? Object.fromEntries(
        Object.entries(next.visionBatchWebhookHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

    return {
      site: typeof next.site === "string" && next.site.trim() ? next.site.trim() : target,
      lineName: typeof next.lineName === "string" && next.lineName.trim() ? next.lineName.trim() : target,
      auditTitle: typeof next.auditTitle === "string" && next.auditTitle.trim() ? next.auditTitle.trim() : target + " 审计闭环",
      auditDate: typeof next.auditDate === "string" && next.auditDate.trim() ? next.auditDate.trim() : new Date().toISOString().slice(0, 10),
      owner: typeof next.owner === "string" ? next.owner : undefined,
      evidenceDir: typeof next.evidenceDir === "string" && next.evidenceDir.trim() ? next.evidenceDir.trim() : undefined,
      evidenceFiles,
      checklist: Array.isArray(next.checklist) ? next.checklist : [],
      findings: Array.isArray(next.findings) ? next.findings : [],
      standards: Array.isArray(next.standards) ? next.standards : [],
      exportDir: typeof next.exportDir === "string" && next.exportDir.trim() ? next.exportDir.trim() : undefined,
      exportPptx: next.exportPptx !== false,
      presentationTitle: typeof next.presentationTitle === "string" && next.presentationTitle.trim() ? next.presentationTitle.trim() : undefined,
      visionWebhookUrl: typeof next.visionWebhookUrl === "string" ? next.visionWebhookUrl : undefined,
      visionWebhookHeaders,
      visionWebhookRetries: typeof next.visionWebhookRetries === "number" ? next.visionWebhookRetries : 1,
      visionWebhookBackoffMs: typeof next.visionWebhookBackoffMs === "number" ? next.visionWebhookBackoffMs : 500,
      visionBatchWebhookUrl: typeof next.visionBatchWebhookUrl === "string" ? next.visionBatchWebhookUrl : undefined,
      visionBatchWebhookHeaders,
      visionBatchWebhookRetries: typeof next.visionBatchWebhookRetries === "number" ? next.visionBatchWebhookRetries : 1,
      visionBatchWebhookBackoffMs: typeof next.visionBatchWebhookBackoffMs === "number" ? next.visionBatchWebhookBackoffMs : 700,
      visionBatchMaxImages: typeof next.visionBatchMaxImages === "number" ? next.visionBatchMaxImages : 6,
      aiConnectionId: typeof next.aiConnectionId === "string" ? next.aiConnectionId : undefined,
      visionProviderConnectionId: typeof next.visionProviderConnectionId === "string" ? next.visionProviderConnectionId : undefined,
      note: typeof next.note === "string" ? next.note : undefined,
    } satisfies Record<string, unknown>;
  }

  return next;
}

export async function listRuns(): Promise<RunView[]> {
  const runs = await listRunRecords();
  const result: RunView[] = [];
  for (const record of runs) {
    const [events, artifacts] = await Promise.all([
      listRunEvents(record.id, 20),
      listRunArtifacts(record.id),
    ]);
    result.push(materializeRunView(record, events, artifacts));
  }
  return result;
}

export async function getRun(runId: string): Promise<RunView> {
  const record = await getRunRecordById(runId);
  if (!record) throw new NotFoundError("Run", runId);
  const [events, artifacts] = await Promise.all([
    listRunEvents(record.id, 50),
    listRunArtifacts(record.id),
  ]);
  return materializeRunView(record, events, artifacts);
}

export async function getRunDetail(runId: string): Promise<RunDetailView> {
  const record = await getRunRecordById(runId);
  if (!record) throw new NotFoundError("Run", runId);
  const [events, artifacts] = await Promise.all([
    listRunEvents(record.id, 200),
    listRunArtifacts(record.id),
  ]);
  return {
    ...materializeRunView(record, events, artifacts),
    events,
    artifacts,
  };
}

export async function createRun(input: CreateRunInput): Promise<RunView> {
  if (!input.templateId) throw new ValidationError("templateId is required");
  if (!input.target || input.target.trim().length < 3) {
    throw new ValidationError("target must be at least 3 characters");
  }

  const cleanTitle = input.title?.trim();
  const cleanTarget = input.target.trim();
  const cleanOperatorNote = input.operatorNote?.trim();

  if (cleanTitle && cleanTitle.length > 80) {
    throw new ValidationError("title must be at most 80 characters");
  }
  if (cleanOperatorNote && cleanOperatorNote.length > 400) {
    throw new ValidationError("operatorNote must be at most 400 characters");
  }

  const [template, governance] = await Promise.all([
    getTemplateById(input.templateId),
    getGovernanceSettingsRecord(),
  ]);
  if (!template) throw new ValidationError(`unknown template: ${input.templateId}`);

  const lifecycle = input.lifecycle ?? governance.defaultLifecycle;
  const defaultModel =
    template.domain === "browser"
      ? governance.browserDefaultModel
      : template.domain === "media"
        ? governance.mediaDefaultModel
        : governance.factoryDefaultModel;

  const executor = inferExecutor(template.id);
  const rawInput = parseExecutionInput(input.executionInput);
  const mergedInput = await mergeBrowserCredentialProfile(template.id, rawInput);
  const executionInput = normalizeExecutionInput(template.id, cleanTarget, mergedInput);

  const now = new Date().toISOString();
  const record: RunRecord = {
    id: crypto.randomUUID(),
    traceId: `trace_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
    templateId: template.id,
    templateName: template.name,
    title: cleanTitle || `${template.name} · ${cleanTarget}`,
    goal: template.goal,
    target: cleanTarget,
    createdAt: now,
    lifecycle,
    desiredState: "active",
    status: "queued",
    progressPercent: 0,
    updatedAt: now,
    liveSummary: executor.executionMode === "real" ? "等待真实执行器接手" : "Queued for worker",
    labels: [template.domain, lifecycle, cleanTitle ? "custom-title" : "auto-title", "sqlite", executor.executionMode],
    operatorNotes: [
      ...(cleanOperatorNote ? [`operator-intent: ${cleanOperatorNote}`] : []),
      "feature-first service layout",
      "SSE enabled for live status",
      "SQLite-backed runtime state",
      `executor=${executor.executorType}`,
      `mode=${executor.executionMode}`,
    ],
    modelPolicy: {
      defaultModel,
      fallbackModel: template.modelPolicy.fallbackModel,
      verification: template.modelPolicy.verification,
    },
    executorType: executor.executorType,
    executionMode: executor.executionMode,
    executionInput,
    executionSummary: {
      notes: [
        executor.executionMode === "real" ? "该 run 会尝试真实执行并落真实产物" : "该 run 当前仍走模拟执行器",
      ],
      realArtifactsCount: 0,
    },
    steps: template.steps.map((step) => ({
      ...step,
      status: "pending",
    })),
  };

  await saveRunRecord(record);
  await recordRunEvent({
    runId: record.id,
    createdAt: now,
    level: "info",
    eventType: "run_created",
    message: `Run created from template ${template.id}`,
    payload: {
      templateId: template.id,
      lifecycle,
      target: record.target,
      executorType: record.executorType,
      executionMode: record.executionMode,
      executionInput: record.executionInput,
    },
  });
  return getRun(record.id);
}

export async function updateRunDesiredState(runId: string, desiredState: RunRecord["desiredState"]): Promise<RunView> {
  const record = await getRunRecordById(runId);
  if (!record) throw new NotFoundError("Run", runId);
  if (!["active", "stopped"].includes(desiredState)) {
    throw new ValidationError("desiredState must be active or stopped");
  }
  if (record.desiredState === desiredState) {
    return getRun(record.id);
  }
  if (desiredState === "active" && record.status === "completed") {
    throw new ValidationError("completed run 不能直接恢复，请基于当前证据新建 run");
  }

  const now = new Date().toISOString();
  const shouldResume = desiredState === "active";
  const next: RunRecord = {
    ...record,
    desiredState,
    status: desiredState === "stopped" ? "stopped" : "queued",
    updatedAt: now,
    completedAt: shouldResume ? undefined : record.completedAt,
    liveSummary: desiredState === "stopped" ? "Stopped by operator" : "Re-queued by operator",
    steps: record.steps.map((step) => {
      if (desiredState === "stopped" && step.status === "running") {
        return { ...step, status: "stopped", finishedAt: now };
      }
      if (shouldResume && (step.status === "stopped" || step.status === "attention")) {
        return { ...step, status: "pending", finishedAt: undefined };
      }
      return step;
    }),
  };
  await saveRunRecord(next);
  await recordRunEvent({
    runId: record.id,
    createdAt: now,
    level: desiredState === "stopped" ? "warn" : "info",
    eventType: desiredState === "stopped" ? "run_stopped" : "run_reactivated",
    message: desiredState === "stopped" ? "Run stopped by operator" : "Run reactivated and queued by operator",
  });
  return getRun(record.id);
}

export async function getRunEvents(runId: string) {
  const record = await getRunRecordById(runId);
  if (!record) throw new NotFoundError("Run", runId);
  return listRunEvents(runId, 200);
}

export async function getRunArtifacts(runId: string) {
  const record = await getRunRecordById(runId);
  if (!record) throw new NotFoundError("Run", runId);
  return listRunArtifacts(runId);
}

export async function uploadRunArtifact(input: CreateArtifactInput): Promise<RunArtifact> {
  const record = await getRunRecordById(input.runId);
  if (!record) throw new NotFoundError("Run", input.runId);
  if (!input.label.trim()) throw new ValidationError("artifact label is required");
  const artifact = await createArtifact(input);
  await recordRunEvent({
    runId: input.runId,
    createdAt: artifact.createdAt,
    level: "info",
    eventType: "artifact_uploaded",
    message: `Artifact uploaded: ${artifact.label}`,
    payload: {
      artifactId: artifact.id,
      kind: artifact.kind,
      contentType: artifact.contentType,
    },
  });
  return artifact;
}

export async function resolveArtifact(runId: string, artifactId: string) {
  const record = await getRunRecordById(runId);
  if (!record) throw new NotFoundError("Run", runId);
  const artifact = await getRunArtifact(runId, artifactId);
  if (!artifact) throw new NotFoundError("Artifact", artifactId);
  return artifact;
}

export async function getRunCounts(runId: string) {
  return {
    eventsCount: await countRunEvents(runId),
    artifactsCount: await countRunArtifacts(runId),
  };
}
