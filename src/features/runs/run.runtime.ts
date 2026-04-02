import type { RunArtifact, RunEvent, RunRecord, RunView } from "./run.types";

function getCurrentStepTitle(record: RunRecord): string | undefined {
  const running = record.steps.find((step) => step.status === "running");
  if (running) return running.title;
  const pending = record.steps.find((step) => step.status === "pending");
  if (pending) return pending.title;
  const completed = [...record.steps].reverse().find((step) => step.status === "completed");
  return completed?.title;
}

function buildRiskFlags(record: RunRecord, artifacts: RunArtifact[], events: RunEvent[]): string[] {
  const flags = new Set<string>();

  if (record.lifecycle === "persistent") flags.add("persistent-run");
  if (events.length === 0) flags.add("no-events");
  if (record.status !== "queued" && artifacts.length === 0) flags.add("no-artifacts-yet");
  if (record.status === "completed" && !artifacts.some((artifact) => artifact.kind === "replay")) {
    flags.add("no-replay-pack");
  }
  if (record.status === "stopped") flags.add("stopped");
  if (record.status === "attention") flags.add("attention");
  if (record.executionMode !== "real") flags.add("simulated-execution");
  if (record.executionMode === "real" && !artifacts.some((artifact) => ["output", "evidence", "replay"].includes(artifact.kind))) {
    flags.add("real-artifacts-missing");
  }

  return [...flags];
}

function buildNextAction(record: RunRecord, artifacts: RunArtifact[], events: RunEvent[], currentStepTitle?: string): string {
  if (record.status === "queued") {
    return record.executionMode === "real"
      ? "等待真实执行器接手；如果长时间不动，先看 worker 心跳、executor 输入和最近 event。"
      : "等待 worker 接手；如果长时间不动，先看治理页和 worker 心跳。";
  }
  if (record.status === "running") {
    return currentStepTitle ? `继续观察当前步骤：${currentStepTitle}，并确认真实产物持续落盘。` : "继续观察执行，并在关键节点补证据。";
  }
  if (record.status === "stopped") {
    return "决定是恢复 run，还是基于当前证据新建替代 run。";
  }
  if (record.status === "attention") {
    return events[0]?.message ? `先处理异常：${events[0].message}` : "先查看最近 event，定位 attention 原因。";
  }
  if (!artifacts.some((artifact) => artifact.kind === "replay")) {
    return "补 replay/evidence，再决定归档还是继续扩展执行器。";
  }
  return record.executionMode === "real"
    ? "复核 replay、manifest 和真实产物摘要，确认这次 run 可直接复用。"
    : "复核 replay 与 artifact，确认结果可复用后再推进真实 executor 接入。";
}

function buildAssistantSummary(record: RunRecord, events: RunEvent[], artifacts: RunArtifact[], currentStepTitle?: string): string {
  const lastEvent = events[0];
  if (record.status === "queued") {
    return currentStepTitle
      ? `Run 已入队，执行器 ${record.executorType}，下一步是 ${currentStepTitle}。`
      : `Run 已入队，等待执行器 ${record.executorType} 接手。`;
  }
  if (record.status === "running") {
    return currentStepTitle
      ? `Run 正在用 ${record.executorType} 执行 ${currentStepTitle}，当前进度 ${record.progressPercent}%。`
      : `Run 正在执行，当前进度 ${record.progressPercent}%。`;
  }
  if (record.status === "stopped") {
    return lastEvent ? `Run 已停止：${lastEvent.message}` : "Run 已被手动停止。";
  }
  if (record.status === "attention") {
    return lastEvent ? `Run 进入 attention：${lastEvent.message}` : "Run 进入 attention，需人工介入。";
  }
  return `Run 已完成，执行模式 ${record.executionMode === "real" ? "真实执行" : "模拟执行"}，留下 ${artifacts.length} 个 artifact，最后事件：${lastEvent?.message ?? "none"}。`;
}

export function materializeRunView(record: RunRecord, events: RunEvent[], artifacts: RunArtifact[]): RunView {
  const lastEvent = events[0];
  const currentStepTitle = getCurrentStepTitle(record);
  const riskFlags = buildRiskFlags(record, artifacts, events);
  const attentionReason =
    record.status === "attention"
      ? (lastEvent?.message ?? "Run requires manual attention")
      : record.status === "stopped"
        ? "Run was stopped by operator"
        : record.status === "completed" && riskFlags.includes("no-replay-pack")
          ? "Run completed but replay pack is still missing"
          : undefined;

  const realArtifacts = artifacts.filter((artifact) => ["output", "evidence", "replay"].includes(artifact.kind));

  return {
    ...record,
    executionSummary: {
      ...(record.executionSummary ?? {}),
      realArtifactsCount: realArtifacts.length,
      lastArtifactLabels: artifacts.slice(0, 5).map((artifact) => artifact.label),
    },
    assistantSummary: buildAssistantSummary(record, events, artifacts, currentStepTitle),
    nextAction: buildNextAction(record, artifacts, events, currentStepTitle),
    riskFlags,
    attentionReason,
    currentStepTitle,
    replayHints: [
      `traceId=${record.traceId}`,
      `lifecycle=${record.lifecycle}`,
      `target=${record.target}`,
      `executor=${record.executorType}`,
      `mode=${record.executionMode}`,
      currentStepTitle ? `currentStep=${currentStepTitle}` : "currentStep=not-started",
      lastEvent ? `lastEvent=${lastEvent.eventType}` : "lastEvent=none",
    ],
    eventsCount: events.length,
    artifactsCount: artifacts.length,
  };
}
