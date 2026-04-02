"use client";

import { useMemo, useState } from "react";
import type { BrowserProfileRecord } from "@/features/browser-profiles/browser-profile.types";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return value.trim() ? (JSON.parse(value) as T) : fallback;
  } catch {
    throw new Error("JSON 格式不合法");
  }
}

export function BrowserProfilesPanel({ initialProfiles }: { initialProfiles: BrowserProfileRecord[] }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "默认登录态",
    description: "",
    storageStatePath: "",
    headersJson: "{}",
    cookiesJson: "[]",
    basicAuthJson: "",
    locale: "zh-CN",
    userAgent: "",
    secretsJson: '{\n  "username": "demo",\n  "password": "secret"\n}',
    totpJson: '{\n  "secret": "JBSWY3DPEHPK3PXP",\n  "issuer": "Operator Studio",\n  "accountName": "demo",\n  "digits": 6,\n  "period": 30,\n  "algorithm": "SHA1"\n}',
  });

  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [profiles]);

  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        storageStatePath: form.storageStatePath || undefined,
        headers: parseJson<Record<string, string>>(form.headersJson, {}),
        cookies: parseJson<Record<string, unknown>[]>(form.cookiesJson, []),
        basicAuth: form.basicAuthJson.trim()
          ? parseJson<{ username: string; password: string }>(form.basicAuthJson, { username: "", password: "" })
          : undefined,
        locale: form.locale || undefined,
        userAgent: form.userAgent || undefined,
        secrets: form.secretsJson.trim() ? parseJson<Record<string, string>>(form.secretsJson, {}) : undefined,
        totp: form.totpJson.trim() ? parseJson<Record<string, unknown>>(form.totpJson, {}) : undefined,
      };
      const response = await fetch("/api/browser-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "创建资料失败");
      setProfiles((current) => [result.data as BrowserProfileRecord, ...current]);
      setForm((current) => ({
        ...current,
        name: "",
        description: "",
        storageStatePath: "",
        headersJson: "{}",
        cookiesJson: "[]",
        basicAuthJson: "",
        locale: "zh-CN",
        userAgent: "",
        secretsJson: "",
        totpJson: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建资料失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile(profileId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/browser-profiles/${profileId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "删除资料失败");
      setProfiles((current) => current.filter((item) => item.id !== profileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除资料失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-card p-6 md:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="section-kicker">浏览器资料</div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">登录态与凭据</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          {profiles.length} 个资料
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={createProfile} className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <label className="block text-sm font-medium text-slate-700">
            名称
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              className="input-shell"
              placeholder="例如：ERP 登录态"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            描述
            <input
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              className="input-shell"
              placeholder="可选"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            storageStatePath
            <input
              value={form.storageStatePath}
              onChange={(e) => setForm((current) => ({ ...current, storageStatePath: e.target.value }))}
              className="input-shell"
              placeholder="/abs/path/storage-state.json"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Locale
              <input
                value={form.locale}
                onChange={(e) => setForm((current) => ({ ...current, locale: e.target.value }))}
                className="input-shell"
                placeholder="zh-CN"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              User Agent
              <input
                value={form.userAgent}
                onChange={(e) => setForm((current) => ({ ...current, userAgent: e.target.value }))}
                className="input-shell"
                placeholder="可选"
              />
            </label>
          </div>

          <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">高级项</summary>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Header JSON
                <textarea value={form.headersJson} onChange={(e) => setForm((current) => ({ ...current, headersJson: e.target.value }))} className="textarea-shell min-h-[120px] font-mono text-xs" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Cookie JSON
                <textarea value={form.cookiesJson} onChange={(e) => setForm((current) => ({ ...current, cookiesJson: e.target.value }))} className="textarea-shell min-h-[120px] font-mono text-xs" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Basic Auth JSON
                <textarea value={form.basicAuthJson} onChange={(e) => setForm((current) => ({ ...current, basicAuthJson: e.target.value }))} className="textarea-shell min-h-[110px] font-mono text-xs" placeholder='{"username":"demo","password":"secret"}' />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                登录 Secrets JSON
                <textarea value={form.secretsJson} onChange={(e) => setForm((current) => ({ ...current, secretsJson: e.target.value }))} className="textarea-shell min-h-[110px] font-mono text-xs" placeholder='{"username":"demo","password":"secret"}' />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                TOTP JSON
                <textarea value={form.totpJson} onChange={(e) => setForm((current) => ({ ...current, totpJson: e.target.value }))} className="textarea-shell min-h-[130px] font-mono text-xs" />
              </label>
            </div>
          </details>

          <div className="flex items-center gap-3">
            <button
              disabled={busy}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "保存中..." : "保存资料"}
            </button>
            {error ? <span className="text-sm text-red-600">{error}</span> : null}
          </div>
        </form>

        <div className="grid gap-4">
          {sortedProfiles.length > 0 ? (
            sortedProfiles.map((profile) => (
              <article key={profile.id} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{profile.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{profile.description || "无描述"}</div>
                  </div>
                  <button
                    onClick={() => removeProfile(profile.id)}
                    disabled={busy}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    删除
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">storageState</div>
                    <div className="mt-1 font-semibold text-slate-950">{profile.storageStatePath || "未设置"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">Locale</div>
                    <div className="mt-1 font-semibold text-slate-950">{profile.locale || "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">Cookies</div>
                    <div className="mt-1 font-semibold text-slate-950">{profile.cookies?.length ?? 0}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">TOTP</div>
                    <div className="mt-1 font-semibold text-slate-950">{profile.totp ? "已配置" : "未配置"}</div>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-500">
              还没有浏览器资料。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
