"use client";

import { useState } from "react";

export function AuthPanel({ requiresSetup }: { requiresSetup: boolean }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (requiresSetup && password !== confirmPassword) {
        throw new Error("两次密码输入不一致");
      }
      const response = await fetch(requiresSetup ? "/api/auth/bootstrap" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "登录失败");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell flex min-h-[calc(100vh-120px)] items-center justify-center">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-soft">
        <div className="section-kicker">Local Admin Access</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          {requiresSetup ? "初始化 Operator Studio 管理员" : "登录 Operator Studio"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {requiresSetup
            ? "第一次进入需要先创建本地管理员账号。后续所有控制台页面与 API 都需要登录。"
            : "控制台与执行 API 已加本地 session 保护。登录后才能查看 run、治理和 artifact。"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            用户名
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input-shell" placeholder="admin" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            密码
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input-shell" placeholder="至少 8 位" />
          </label>
          {requiresSetup ? (
            <label className="block text-sm font-medium text-slate-700">
              确认密码
              <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" className="input-shell" placeholder="再次输入密码" />
            </label>
          ) : null}
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <button disabled={submitting} className="w-full rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? (requiresSetup ? "初始化中..." : "登录中...") : (requiresSetup ? "创建管理员并进入控制台" : "登录")}
          </button>
        </form>
      </div>
    </main>
  );
}
