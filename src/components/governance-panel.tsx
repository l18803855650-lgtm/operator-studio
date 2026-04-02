"use client";

import { useState } from "react";
import type { GovernanceSettings } from "@/features/governance/governance.types";
import type { AiConnectionRecord } from "@/features/ai-connections/ai-connection.types";

export function GovernancePanel({
  initialSettings,
  aiConnections,
}: {
  initialSettings: GovernanceSettings;
  aiConnections: AiConnectionRecord[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          defaultAiConnectionId: settings.defaultAiConnectionId || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "保存失败");
      setSettings(payload.data.settings as GovernanceSettings);
      setMessage("已保存。后续新建 run 会按这套默认参数执行。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="section-kicker">Operator Defaults</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">把默认规则收简单一点</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">这里不是给开发者堆参数的地方，而是把“默认生命周期、并发、视觉校验、默认 AI 连接”这些真正会影响使用体验的项收口。</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">当前默认生命周期：{settings.defaultLifecycle === "persistent" ? "常驻" : "临时"}</div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          默认运行方式
          <select value={settings.defaultLifecycle} onChange={(e) => setSettings((current) => ({ ...current, defaultLifecycle: e.target.value as GovernanceSettings["defaultLifecycle"] }))} className="input-shell">
            <option value="temporary">临时运行</option>
            <option value="persistent">常驻运行</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          默认 AI 连接（当前主要给 Factory 图片理解用）
          <select value={settings.defaultAiConnectionId || ""} onChange={(e) => setSettings((current) => ({ ...current, defaultAiConnectionId: e.target.value || null }))} className="input-shell">
            <option value="">不启用默认 AI 连接</option>
            {aiConnections.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {item.model}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Worker 轮询间隔（毫秒）
          <input type="number" min={1000} step={500} value={settings.workerPollIntervalMs} onChange={(e) => setSettings((current) => ({ ...current, workerPollIntervalMs: Number(e.target.value || 5000) }))} className="input-shell" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          最大并发 run 数
          <input type="number" min={1} max={20} value={settings.maxConcurrentRuns} onChange={(e) => setSettings((current) => ({ ...current, maxConcurrentRuns: Number(e.target.value || 3) }))} className="input-shell" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          每日 run 预算
          <input type="number" min={1} max={500} value={settings.dailyRunBudget} onChange={(e) => setSettings((current) => ({ ...current, dailyRunBudget: Number(e.target.value || 24) }))} className="input-shell" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          产物保留天数
          <input type="number" min={1} max={365} value={settings.artifactRetentionDays} onChange={(e) => setSettings((current) => ({ ...current, artifactRetentionDays: Number(e.target.value || 14) }))} className="input-shell" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Browser 默认模型标签
          <input value={settings.browserDefaultModel} onChange={(e) => setSettings((current) => ({ ...current, browserDefaultModel: e.target.value }))} className="input-shell" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Media 默认模型标签
          <input value={settings.mediaDefaultModel} onChange={(e) => setSettings((current) => ({ ...current, mediaDefaultModel: e.target.value }))} className="input-shell" />
        </label>

        <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
          Factory 默认模型标签
          <input value={settings.factoryDefaultModel} onChange={(e) => setSettings((current) => ({ ...current, factoryDefaultModel: e.target.value }))} className="input-shell" />
        </label>

        <div className="lg:col-span-2 grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <input type="checkbox" checked={settings.persistentRequiresConfirmation} onChange={(e) => setSettings((current) => ({ ...current, persistentRequiresConfirmation: e.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900" />
            <span><strong className="text-slate-900">常驻运行需要确认</strong><br />避免误把临时试跑的任务变成长期挂着的服务。</span>
          </label>
          <label className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <input type="checkbox" checked={settings.visualVerificationRequired} onChange={(e) => setSettings((current) => ({ ...current, visualVerificationRequired: e.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900" />
            <span><strong className="text-slate-900">交付前默认要求视觉验收</strong><br />保持“截图先验，再发给老板”的硬规则。</span>
          </label>
        </div>

        <div className="lg:col-span-2 flex items-center gap-3">
          <button disabled={submitting} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? "保存中..." : "保存默认设置"}
          </button>
          {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </form>
    </section>
  );
}
