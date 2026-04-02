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
    notes: "用于 factory 图片理解；后续 browser / media 也可复用这套连接。",
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
      setForm((current) => ({ ...current, apiKey: "" }));
      setMessage("连接已保存。现在可以去上面把它设为默认，或者在发起 factory run 时显式选择它。");
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
      setMessage("连接已删除。如果它原来是默认连接，治理默认值也会自动清空。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除连接失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="section-kicker">AI Connections</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">连接你自己的 API</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            给不想自己写 webhook 的用户准备的简化入口。直接在前端填入 OpenAI 兼容地址、模型和 API Key，当前主要用于
            factory 图片理解，后面可以继续扩到 browser / media。
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          当前共 {connections.length} 个连接
        </div>
      </div>

      <form onSubmit={createConnection} className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          连接名称
          <input
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            className="input-shell"
            placeholder="例如：我的 OpenAI 兼容视觉连接"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          模型名
          <input
            value={form.model}
            onChange={(e) => setForm((current) => ({ ...current, model: e.target.value }))}
            className="input-shell"
            placeholder="例如：gpt-4.1-mini / glm-4.6v-flash"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
          Base URL
          <input
            value={form.baseUrl}
            onChange={(e) => setForm((current) => ({ ...current, baseUrl: e.target.value }))}
            className="input-shell"
            placeholder="例如：https://api.openai.com/v1"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
          API Key
          <input
            value={form.apiKey}
            onChange={(e) => setForm((current) => ({ ...current, apiKey: e.target.value }))}
            className="input-shell"
            type="password"
            placeholder="sk-... / 你的第三方平台 key"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
          备注（可选）
          <textarea
            value={form.notes}
            onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
            className="input-shell min-h-[100px]"
            placeholder="例如：默认给工厂模板做图片理解"
          />
        </label>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600 lg:col-span-2">
          保存后只回显脱敏预览，不会把明文 API Key 再发回前端；运行时由 worker 直接读取加密存储。
        </div>
        <div className="flex items-center gap-3 lg:col-span-2">
          <button
            disabled={busy}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "连接中..." : "保存连接"}
          </button>
          {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </form>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {sorted.length > 0 ? (
          sorted.map((item) => (
            <article key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-slate-950">{item.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.notes || "无备注"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeConnection(item.id)}
                  disabled={busy}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950 disabled:opacity-60"
                >
                  删除
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div>
                  <strong>provider:</strong> {item.provider}
                </div>
                <div>
                  <strong>baseUrl:</strong> {item.baseUrl}
                </div>
                <div>
                  <strong>model:</strong> {item.model}
                </div>
                <div>
                  <strong>apiKey:</strong> {item.apiKeyPreview || "已加密保存"}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-500 lg:col-span-2">
            还没有 AI 连接。先在上面填入你自己的 API，就能让工厂图片理解不再依赖外部 webhook。
          </div>
        )}
      </div>
    </section>
  );
}
