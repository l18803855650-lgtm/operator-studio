"use client";

import { useState } from "react";
import type { GovernanceStatus } from "@/features/governance/governance.types";
import { formatDateTime, formatRelativeTime, lifecycleMeta, workerStatusMeta } from "@/lib/presenter";

export function GovernancePanel({ initial }: { initial: GovernanceStatus }) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const worker = workerStatusMeta[state.worker.status];
  const lifecycle = lifecycleMeta[state.settings.defaultLifecycle];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        defaultLifecycle: String(form.get("defaultLifecycle") ?? state.settings.defaultLifecycle),
        workerPollIntervalMs: Number(form.get("workerPollIntervalMs") ?? state.settings.workerPollIntervalMs),
        maxConcurrentRuns: Number(form.get("maxConcurrentRuns") ?? state.settings.maxConcurrentRuns),
        dailyRunBudget: Number(form.get("dailyRunBudget") ?? state.settings.dailyRunBudget),
        artifactRetentionDays: Number(form.get("artifactRetentionDays") ?? state.settings.artifactRetentionDays),
        browserDefaultModel: String(form.get("browserDefaultModel") ?? state.settings.browserDefaultModel),
        mediaDefaultModel: String(form.get("mediaDefaultModel") ?? state.settings.mediaDefaultModel),
        factoryDefaultModel: String(form.get("factoryDefaultModel") ?? state.settings.factoryDefaultModel),
        persistentRequiresConfirmation: form.get("persistentRequiresConfirmation") === "on",
        visualVerificationRequired: form.get("visualVerificationRequired") === "on",
      };
      const response = await fetch("/api/governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Failed to update governance");
      setState(json.data as GovernanceStatus);
      setNotice("治理参数已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="section-card overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
          <div>
            <div className="section-kicker">Governance center</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">把默认规则写进系统，而不是靠口头提醒。</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
              这里集中收口生命周期、预算、并发、模型路由和验收策略。
              做完一处设置，Run 控制台、worker 与后续新建 run 都能共享同一套默认值。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`badge ${worker.badgeClass}`}>worker {worker.label}</span>
              <span className={`badge ${lifecycle.badgeClass}`}>默认 {lifecycle.label}</span>
              <span className="badge border-slate-200 bg-white text-slate-700">并发 {state.settings.maxConcurrentRuns}</span>
              <span className="badge border-slate-200 bg-white text-slate-700">预算 {state.settings.dailyRunBudget}</span>
            </div>
          </div>

          <div className="rounded-[28px] bg-slate-950 p-5 text-white">
            <div className="text-xs uppercase tracking-[0.24em] text-brand-200">Worker signal</div>
            <div className="mt-3 text-2xl font-bold">{worker.label}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{worker.hint}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <div className="text-xs text-slate-400">最近心跳</div>
                <div className="mt-1 font-semibold text-white">{formatRelativeTime(state.worker.heartbeatAt)}</div>
                <div className="mt-1 text-xs text-slate-400">{formatDateTime(state.worker.heartbeatAt)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <div className="text-xs text-slate-400">Worker meta</div>
                <div className="mt-1 font-semibold text-white">PID {String(state.worker.meta?.pid ?? "—")}</div>
                <div className="mt-1 text-xs text-slate-400">host {String(state.worker.meta?.host ?? "—")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Worker 状态", value: worker.label, hint: formatDateTime(state.worker.heartbeatAt) },
          { label: "默认生命周期", value: lifecycle.label, hint: state.settings.persistentRequiresConfirmation ? "常驻需要明确确认" : "常驻无需额外确认" },
          { label: "并发 run 限额", value: state.settings.maxConcurrentRuns, hint: `轮询 ${state.settings.workerPollIntervalMs}ms` },
          { label: "每日预算", value: state.settings.dailyRunBudget, hint: `artifact 保留 ${state.settings.artifactRetentionDays} 天` },
        ].map((card) => (
          <div key={card.label} className="section-card p-5">
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{card.value}</div>
            <div className="mt-2 text-xs leading-5 text-slate-500">{card.hint}</div>
          </div>
        ))}
      </section>

      <form onSubmit={handleSubmit} className="section-card p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="section-kicker">Policy editor</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">治理参数编辑</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">改这里，相当于改后续 run 的默认运行方式。</p>
          </div>
          {notice ? (
            <div className={`rounded-2xl px-4 py-3 text-sm ${notice.includes("更新") ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
              {notice}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-lg font-semibold text-slate-950">默认运行规则</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  默认生命周期
                  <select name="defaultLifecycle" defaultValue={state.settings.defaultLifecycle} className="input-shell">
                    <option value="persistent">常驻（persistent）</option>
                    <option value="temporary">临时（temporary）</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Worker 轮询间隔（ms）
                  <input name="workerPollIntervalMs" type="number" defaultValue={state.settings.workerPollIntervalMs} className="input-shell" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  最大并发 run
                  <input name="maxConcurrentRuns" type="number" defaultValue={state.settings.maxConcurrentRuns} className="input-shell" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  每日 run 预算
                  <input name="dailyRunBudget" type="number" defaultValue={state.settings.dailyRunBudget} className="input-shell" />
                </label>
                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  artifact 保留天数
                  <input name="artifactRetentionDays" type="number" defaultValue={state.settings.artifactRetentionDays} className="input-shell" />
                </label>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-lg font-semibold text-slate-950">模型路由</div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="block text-sm font-medium text-slate-700">
                  Browser 默认模型
                  <input name="browserDefaultModel" defaultValue={state.settings.browserDefaultModel} className="input-shell" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Media 默认模型
                  <input name="mediaDefaultModel" defaultValue={state.settings.mediaDefaultModel} className="input-shell" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Factory 默认模型
                  <input name="factoryDefaultModel" defaultValue={state.settings.factoryDefaultModel} className="input-shell" />
                </label>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="text-lg font-semibold text-slate-950">执行硬规则</div>
              <div className="mt-4 grid gap-3 text-sm text-slate-700">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <input name="persistentRequiresConfirmation" type="checkbox" defaultChecked={state.settings.persistentRequiresConfirmation} />
                  <div>
                    <div className="font-semibold text-slate-900">常驻 run 必须明确确认</div>
                    <div className="mt-1 text-xs text-slate-500">防止把临时动作误托管成长期任务。</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <input name="visualVerificationRequired" type="checkbox" defaultChecked={state.settings.visualVerificationRequired} />
                  <div>
                    <div className="font-semibold text-slate-900">执行结果必须视觉验收</div>
                    <div className="mt-1 text-xs text-slate-500">尤其适用于 UI、截图、排版和媒体输出场景。</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="text-lg font-semibold text-slate-950">使用说明</div>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                <p>1. 先收口默认生命周期，避免常驻 / 临时混乱。</p>
                <p>2. 再调并发与预算，保证 worker 节奏稳定。</p>
                <p>3. 最后改模型路由，把 Browser / Media / Factory 分开管理。</p>
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="text-lg font-semibold text-slate-950">当前重点提醒</div>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">如果 worker 心跳变 stale，先查服务状态，再看界面数据。</div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">常驻规则建议保持严格，否则系统会积累很多“挂着但没人认领”的 run。</div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">视觉验收建议默认开启，尤其是界面和文档导出类任务。</div>
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="text-lg font-semibold text-slate-950">worker meta</div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div>PID：<span className="font-semibold text-slate-900">{String(state.worker.meta?.pid ?? "—")}</span></div>
                <div>Host：<span className="font-semibold text-slate-900">{String(state.worker.meta?.host ?? "—")}</span></div>
                <div>Poll：<span className="font-semibold text-slate-900">{String(state.worker.meta?.pollMs ?? "—")}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button disabled={saving} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "保存中..." : "保存治理配置"}
          </button>
        </div>
      </form>
    </div>
  );
}
