"use client";

import { useMemo, useState } from "react";
import type { AiConnectionRecord } from "@/features/ai-connections/ai-connection.types";

export function AiConnectionsPanel({ initialConnections }: { initialConnections: AiConnectionRecord[] }) {
  const [connections, setConnections] = useState(initialConnections);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "默认 AI 连接",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4.1-mini",
    notes: "",
  });

  const sorted = useMemo(
    () => [...connections].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [connections],
  );

  async function createConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ai-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "创建连接失败");
      setConnections((current) => [payload.data as AiConnectionRecord, ...current]);
      setForm((current) => ({ ...current, apiKey: "", notes: "" }));
      setMessage("已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建连接失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeConnection(connectionId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/ai-connections/${connectionId}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "删除连接失败");
      setConnections((current) => current.filter((item) => item.id !== connectionId));
      setMessage("已删除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除连接失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-card p-6 md:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="section-kicker">API 连接</div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">用户自己的模型接口</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          {connections.length} 个连接
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={createConnection} className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <label className="block text-sm font-medium text-slate-700">
            名称
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              className="input-shell"
              placeholder="例如：我的视觉模型"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            接口地址
            <input
              value={form.baseUrl}
              onChange={(e) => setForm((current) => ({ ...current, baseUrl: e.target.value }))}
              className="input-shell"
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            模型名
            <input
              value={form.model}
              onChange={(e) => setForm((current) => ({ ...current, model: e.target.value }))}
              className="input-shell"
              placeholder="gpt-4.1-mini / glm-4.6v-flash"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            API Key
            <input
              value={form.apiKey}
              onChange={(e) => setForm((current) => ({ ...current, apiKey: e.target.value }))}
              className="input-shell"
              type="password"
              placeholder="sk-..."
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            备注
            <textarea
              value={form.notes}
              onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
              className="textarea-shell"
              placeholder="可选"
            />
          </label>

          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">只显示脱敏预览，明文 Key 不会回传前端。</div>

          <div className="flex items-center gap-3">
            <button
              disabled={busy}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "保存中..." : "保存连接"}
            </button>
            {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
            {error ? <span className="text-sm text-red-600">{error}</span> : null}
          </div>
        </form>

        <div className="grid gap-4">
          {sorted.length > 0 ? (
            sorted.map((item) => (
              <article key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{item.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.notes || "无备注"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeConnection(item.id)}
                    disabled={busy}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    删除
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">模型</div>
                    <div className="mt-1 font-semibold text-slate-950">{item.model}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">Key 预览</div>
                    <div className="mt-1 font-semibold text-slate-950">{item.apiKeyPreview || "已保存"}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-500">{item.baseUrl}</div>
              </article>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-500">
              还没有连接。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
