"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "总览" },
  { href: "/governance", label: "治理" },
];

export function AppHeader({ username }: { username?: string }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black tracking-[0.2em] text-white">OS</div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-600">Operator Studio</div>
              <div className="text-xs text-slate-500">可审计执行控制台 / 完整版内核</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${active ? "bg-slate-950 text-white shadow-soft" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 md:inline-flex">
            Next.js 14 · SQLite · Worker · Auth
          </span>
          {username ? (
            <>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">管理员：{username}</span>
              <button onClick={logout} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
                退出
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
