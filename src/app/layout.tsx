import "./globals.css";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { getCurrentPageSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Operator Studio｜可审计执行控制台",
  description: "面向中文场景的可审计执行型 Agent 控制台，支持 run、回放、证据包与治理策略。",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentPageSession();
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen bg-transparent text-slate-900">
          <AppHeader username={session?.username} />
          {children}
          <footer className="border-t border-white/60 bg-white/70 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
              <div>Operator Studio · 中文优先 · 审计闭环 · 结果可回放</div>
              <div>Next.js 14 · SQLite · SSE · Worker</div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
