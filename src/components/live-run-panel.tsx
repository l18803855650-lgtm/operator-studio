"use client";

import { useEffect, useMemo, useState } from "react";
import type { RunArtifact, RunDetailView, RunEvent } from "@/features/runs/run.types";
import { ArtifactUploadForm } from "@/components/artifact-upload-form";
import {
  artifactKindMeta,
  countArtifactsByKind,
  domainMeta,
  eventLevelMeta,
  formatDateTime,
  formatPercent,
  formatRelativeTime,
  inferRunDomain,
  lifecycleMeta,
  runStatusMeta,
  runStepStatusMeta,
} from "@/lib/presenter";

function hydrateRun(base: RunDetailView, events: RunEvent[], artifacts: RunArtifact[]): RunDetailView {
  return {
    ...base,
    events,
    artifacts,
    eventsCount: events.length,
    artifactsCount: artifacts.length,
  };
}

export function LiveRunPanel({ initialRun }: { initialRun: RunDetailView }) {
  const [run, setRun] = useState<RunDetailView>(initialRun);
  const [streamState, setStreamState] = useState<"connecting" | "live" | "closed">("connecting");
  const [streamNonce, setStreamNonce] = useState(0);
  const [controlBusy, setControlBusy] = useState<"active" | "stopped" | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const runningStep = useMemo(() => run.steps.find((step) => step.status === "running"), [run.steps]);
  const completedStepCount = useMemo(() => run.steps.filter((step) => step.status === "completed").length, [run.steps]);
  const artifactCounts = useMemo(() => countArtifactsByKind(run.artifacts), [run.artifacts]);
  const latestEvent = run.events[0];
  const statusInfo = runStatusMeta[run.status];
  const lifecycleInfo = lifecycleMeta[run.lifecycle];
  const domainInfo = domainMeta[inferRunDomain(run)];

  useEffect(() => {
    if (run.status === "completed") {
      setStreamState("closed");
      return;
    }

    setStreamState("connecting");
    const source = new EventSource(`/api/runs/${run.id}/stream`);
    source.onmessage = async (event) => {
      const payload = JSON.parse(event.data) as { data?: RunDetailView; error?: string };
      if (!payload.data) {
        setStreamState("closed");
        source.close();
        return;
      }
      const [eventsResp, artifactsResp] = await Promise.all([
        fetch(`/api/runs/${run.id}/events`).then((res) => res.json()),
        fetch(`/api/runs/${run.id}/artifacts`).then((res) => res.json()),
      ]);
      setRun(hydrateRun(payload.data, eventsResp.data as RunEvent[], artifactsResp.data as RunArtifact[]));
      setStreamState("live");
      if (["completed", "stopped"].includes(payload.data.status)) {
        source.close();
        setStreamState("closed");
      }
    };
    source.onerror = () => {
      source.close();
      setStreamState("closed");
    };
    return () => source.close();
  }, [run.id, run.status, streamNonce]);

  async function setDesiredState(desiredState: "active" | "stopped") {
    setControlBusy(desiredState);
    setControlError(null);
    try {
      const response = await fetch(`/api/runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desiredState }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to update run state");
      }
      const [eventsResp, artifactsResp] = await Promise.all([
        fetch(`/api/runs/${run.id}/events`).then((res) => res.json()),
        fetch(`/api/runs/${run.id}/artifacts`).then((res) => res.json()),
      ]);
      setRun(hydrateRun(payload.data as RunDetailView, eventsResp.data as RunEvent[], artifactsResp.data as RunArtifact[]));
      setStreamState(desiredState === "active" ? "connecting" : "closed");
      if (desiredState === "active") {
        setStreamNonce((value) => value + 1);
      }
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Failed to update run state");
    } finally {
      setControlBusy(null);
    }
  }

  function appendArtifact(artifact: RunArtifact) {
    setRun((prev) => hydrateRun({ ...prev }, prev.events, [artifact, ...prev.artifacts]));
  }

  return (
    <div className="space-y-6">
      <div className="section-card overflow-hidden p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-brand-700">
              ← 返回控制台
            </a>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`badge ${domainInfo.badgeClass}`}>{domainInfo.label}</span>
              <span className={`badge ${lifecycleInfo.badgeClass}`}>{lifecycleInfo.label}</span>
              <span className={`badge ${statusInfo.badgeClass}`}>{statusInfo.label}</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{run.title}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{run.goal}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "目标对象", value: run.target },
                { label: "traceId", value: run.traceId, mono: true },
                { label: "执行器", value: `${run.executorType} / ${run.executionMode === "real" ? "真实执行" : "模拟执行"}` },
                { label: "步骤进度", value: `${completedStepCount}/${run.steps.length}` },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="text-xs text-slate-400">{item.label}</div>
                  <div className={`mt-2 font-semibold text-slate-900 ${item.mono ? "font-mono text-xs sm:text-sm" : ""}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full rounded-[28px] bg-slate-950 p-5 text-white shadow-soft xl:max-w-[360px]">
            <div className="text-xs uppercase tracking-[0.22em] text-brand-200">作战态势</div>
            <div className="mt-3 text-2xl font-bold">{run.liveSummary}</div>
            <div className="mt-4 text-sm leading-6 text-slate-300">{run.assistantSummary}</div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <div className="font-semibold text-white">下一步</div>
              <div className="mt-2 leading-6">{run.nextAction}</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${run.progressPercent}%` }} />
            </div>
            <div className="mt-2 text-right text-xs text-slate-300">{formatPercent(run.progressPercent)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-slate-400">事件</div>
                <div className="mt-1 text-lg font-semibold text-white">{run.eventsCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-slate-400">附件</div>
                <div className="mt-1 text-lg font-semibold text-white">{run.artifactsCount}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {(run.status === "running" || run.status === "queued") ? (
                <button
                  onClick={() => setDesiredState("stopped")}
                  disabled={Boolean(controlBusy)}
                  className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {controlBusy === "stopped" ? "停止中..." : "停止 run"}
                </button>
              ) : null}
              {run.status === "stopped" ? (
                <button
                  onClick={() => setDesiredState("active")}
                  disabled={Boolean(controlBusy)}
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {controlBusy === "active" ? "恢复中..." : "恢复 run"}
                </button>
              ) : null}
            </div>
            {controlError ? <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{controlError}</div> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "当前步骤", value: runningStep?.title ?? run.currentStepTitle ?? "未开始", hint: runningStep?.description ?? "等待 worker 推进" },
          { label: "最近更新", value: formatRelativeTime(run.updatedAt), hint: formatDateTime(run.updatedAt) },
          { label: "最近事件", value: latestEvent?.eventType ?? "暂无", hint: latestEvent?.message ?? "还没有 event log" },
          { label: "完成时间", value: run.completedAt ? formatRelativeTime(run.completedAt) : "尚未完成", hint: formatDateTime(run.completedAt) },
        ].map((card) => (
          <div key={card.label} className="section-card p-5">
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className="mt-2 text-xl font-bold text-slate-950">{card.value}</div>
            <div className="mt-2 text-xs leading-5 text-slate-500">{card.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          <div className="section-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Execution timeline</div>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">执行时间线</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">每个步骤都显示状态、证据提示和时间信息，方便定位停在哪一环。</p>
              </div>
              <span className="badge border-slate-200 bg-white text-slate-700">完成 {completedStepCount}/{run.steps.length}</span>
            </div>
            <div className="mt-5 space-y-4">
              {run.steps.map((step, index) => {
                const stepInfo = runStepStatusMeta[step.status];
                return (
                  <div key={step.id} className={`rounded-[24px] border p-4 ${stepInfo.timelineClass}`}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">step {index + 1}</div>
                        <div className="mt-1 text-lg font-semibold text-slate-950">{step.title}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">{step.description}</div>
                      </div>
                      <span className={`badge ${stepInfo.badgeClass}`}>{stepInfo.label}</span>
                    </div>
                    <div className="mt-4 grid gap-3 text-xs text-slate-500 md:grid-cols-5">
                      <div className="rounded-2xl bg-white/80 px-3 py-2">tool：<span className="font-medium text-slate-700">{step.toolHint}</span></div>
                      <div className="rounded-2xl bg-white/80 px-3 py-2">证据：<span className="font-medium text-slate-700">{step.evidenceHint}</span></div>
                      <div className="rounded-2xl bg-white/80 px-3 py-2">耗时预估：<span className="font-medium text-slate-700">~{step.durationSec}s</span></div>
                      <div className="rounded-2xl bg-white/80 px-3 py-2">开始：<span className="font-medium text-slate-700">{formatRelativeTime(step.startedAt)}</span></div>
                      <div className="rounded-2xl bg-white/80 px-3 py-2">结束：<span className="font-medium text-slate-700">{formatRelativeTime(step.finishedAt)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Event log</div>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">事件日志</h2>
              </div>
              <span className="badge border-slate-200 bg-white text-slate-700">{run.events.length} 条</span>
            </div>
            <div className="mt-4 space-y-3">
              {run.events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">还没有事件。</div>
              ) : (
                run.events.map((event) => {
                  const level = eventLevelMeta[event.level];
                  return (
                    <div key={event.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-950">{event.message}</div>
                          <div className="mt-2 text-xs leading-5 text-slate-500">{formatDateTime(event.createdAt)}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`badge ${level.badgeClass}`}>{level.label}</span>
                          <span className="badge border-slate-200 bg-white text-slate-700">{event.eventType}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="section-card p-6">
            <div className="section-kicker">Assistant brief</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">助手摘要</h2>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">summary</div>
                <div className="mt-1 leading-6 text-slate-700">{run.assistantSummary}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">next action</div>
                <div className="mt-1 leading-6 text-slate-700">{run.nextAction}</div>
              </div>
              {run.attentionReason ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-red-500">attention</div>
                  <div className="mt-1 leading-6 text-red-700">{run.attentionReason}</div>
                </div>
              ) : null}
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">risk flags</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {run.riskFlags.length === 0 ? (
                    <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">当前没有额外风险</span>
                  ) : (
                    run.riskFlags.map((flag) => (
                      <span key={flag} className="badge border-slate-200 bg-white text-slate-700">{flag}</span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="section-card p-6">
            <div className="section-kicker">Runtime context</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">执行上下文</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">创建时间：<span className="font-semibold text-slate-900">{formatDateTime(run.createdAt)}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">最后更新：<span className="font-semibold text-slate-900">{formatDateTime(run.updatedAt)}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">生命周期：<span className="font-semibold text-slate-900">{lifecycleInfo.label}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">回放提示数：<span className="font-semibold text-slate-900">{run.replayHints.length}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">执行器类型：<span className="font-semibold text-slate-900">{run.executorType}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">执行模式：<span className="font-semibold text-slate-900">{run.executionMode === "real" ? "真实执行" : "模拟执行"}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">真实产物数：<span className="font-semibold text-slate-900">{String(run.executionSummary?.realArtifactsCount ?? 0)}</span></div>
            </div>
            {run.executionInput ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">executor input</div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-700">{JSON.stringify(run.executionInput, null, 2)}</pre>
              </div>
            ) : null}
            {run.executionSummary ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">execution summary</div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-700">{JSON.stringify(run.executionSummary, null, 2)}</pre>
              </div>
            ) : null}
          </div>

          <div className="section-card p-6">
            <div className="section-kicker">Operator notes</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">交接 / 运行备注</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              {run.operatorNotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500">还没有备注。</div>
              ) : (
                run.operatorNotes.map((note) => (
                  <div key={note} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">{note}</div>
                ))
              )}
            </div>
          </div>

          <div className="section-card p-6">
            <div className="section-kicker">Model policy</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">模型策略</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">默认模型：<span className="font-semibold text-slate-900">{run.modelPolicy.defaultModel}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">回退模型：<span className="font-semibold text-slate-900">{run.modelPolicy.fallbackModel}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">验收方式：<span className="font-semibold text-slate-900">{run.modelPolicy.verification}</span></div>
            </div>
          </div>

          <ArtifactUploadForm runId={run.id} onUploaded={appendArtifact} />

          <div className="section-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Artifacts</div>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">产物与回放</h2>
              </div>
              <span className="badge border-slate-200 bg-white text-slate-700">{run.artifacts.length} 个</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
              {Object.entries(artifactCounts).map(([kind, count]) => (
                <div key={kind} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-400">{artifactKindMeta[kind as keyof typeof artifactKindMeta].label}</div>
                  <div className="mt-1 font-semibold text-slate-900">{count}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {run.artifacts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500">还没有 artifact。</div>
              ) : (
                run.artifacts.map((artifact) => (
                  <a key={artifact.id} href={`/api/runs/${run.id}/artifacts/${artifact.id}`} target="_blank" className="block rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-brand-200 hover:bg-brand-50/30">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-950">{artifact.label}</div>
                      <span className={`badge ${artifactKindMeta[artifact.kind].badgeClass}`}>{artifactKindMeta[artifact.kind].label}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{formatDateTime(artifact.createdAt)}</div>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="section-card p-6">
            <div className="section-kicker">Replay hints</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">回放提示</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {run.replayHints.map((hint) => (
                <span key={hint} className="badge border-slate-200 bg-white text-slate-700">{hint}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
