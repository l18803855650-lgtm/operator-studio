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
      setMessage("已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section-card p-6 md:p-7">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="section-kicker">默认规则</div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">基础设置</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          当前默认：{settings.defaultLifecycle === "persistent" ? "常驻" : "临时"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            默认运行方式
            <select
              value={settings.defaultLifecycle}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  defaultLifecycle: e.target.value as GovernanceSettings["defaultLifecycle"],
                }))
              }
              className="input-shell"
            >
              <option value="temporary">临时运行</option>
              <option value="persistent">常驻运行</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            默认 AI 连接
            <select
              value={settings.defaultAiConnectionId || ""}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  defaultAiConnectionId: e.target.value || null,
                }))
              }
              className="input-shell"
            >
              <option value="">不启用</option>
              {aiConnections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.model}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            最大并发
            <input
              type="number"
              min={1}
              max={20}
              value={settings.maxConcurrentRuns}
              onChange={(e) => setSettings((current) => ({ ...current, maxConcurrentRuns: Number(e.target.value || 3) }))}
              className="input-shell"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            产物保留天数
            <input
              type="number"
              min={1}
              max={365}
              value={settings.artifactRetentionDays}
              onChange={(e) => setSettings((current) => ({ ...current, artifactRetentionDays: Number(e.target.value || 14) }))}
              className="input-shell"
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={settings.persistentRequiresConfirmation}
              onChange={(e) =>
                setSettings((current) => ({ ...current, persistentRequiresConfirmation: e.target.checked }))
              }
              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>
              <strong className="text-slate-900">常驻运行前确认</strong>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={settings.visualVerificationRequired}
              onChange={(e) =>
                setSettings((current) => ({ ...current, visualVerificationRequired: e.target.checked }))
              }
              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>
              <strong className="text-slate-900">交付前做视觉验收</strong>
            </span>
          </label>
        </div>

        <details className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">高级设置</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Worker 轮询间隔（毫秒）
              <input
                type="number"
                min={1000}
                step={500}
                value={settings.workerPollIntervalMs}
                onChange={(e) =>
                  setSettings((current) => ({ ...current, workerPollIntervalMs: Number(e.target.value || 5000) }))
                }
                className="input-shell"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              每日任务预算
              <input
                type="number"
                min={1}
                max={500}
                value={settings.dailyRunBudget}
                onChange={(e) => setSettings((current) => ({ ...current, dailyRunBudget: Number(e.target.value || 24) }))}
                className="input-shell"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Browser 模型标签
              <input
                value={settings.browserDefaultModel}
                onChange={(e) => setSettings((current) => ({ ...current, browserDefaultModel: e.target.value }))}
                className="input-shell"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Media 模型标签
              <input
                value={settings.mediaDefaultModel}
                onChange={(e) => setSettings((current) => ({ ...current, mediaDefaultModel: e.target.value }))}
                className="input-shell"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
              Factory 模型标签
              <input
                value={settings.factoryDefaultModel}
                onChange={(e) => setSettings((current) => ({ ...current, factoryDefaultModel: e.target.value }))}
                className="input-shell"
              />
            </label>
          </div>
        </details>

        <div className="flex items-center gap-3">
          <button
            disabled={submitting}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "保存中..." : "保存设置"}
          </button>
          {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </form>
    </section>
  );
}
