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
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[32px] bg-slate-950 p-8 text-white shadow-soft">
          <div className="section-kicker text-white/50">Operator Studio</div>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            {requiresSetup ? "先完成初始化" : "欢迎回来"}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
            {requiresSetup ? "创建本地管理员后即可进入工作台。" : "登录后继续管理任务、结果和系统设置。"}
          </p>
          <div className="mt-8 space-y-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">本地登录</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">中文界面</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">结果留痕</div>
          </div>
        </section>

        <section className="section-card p-8">
          <div className="section-kicker">登录</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            {requiresSetup ? "创建管理员" : "进入工作台"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              用户名
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input-shell" placeholder="admin" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              密码
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="input-shell"
                placeholder="至少 8 位"
              />
            </label>
            {requiresSetup ? (
              <label className="block text-sm font-medium text-slate-700">
                确认密码
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  className="input-shell"
                  placeholder="再次输入密码"
                />
              </label>
            ) : null}
            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            <button
              disabled={submitting}
              className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (requiresSetup ? "创建中..." : "登录中...") : requiresSetup ? "创建并进入" : "登录"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
