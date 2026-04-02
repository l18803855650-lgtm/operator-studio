import "./globals.css";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { getCurrentPageSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Operator Studio｜执行工作台",
  description: "面向中文场景的执行工作台，支持任务运行、结果留痕、回放与系统设置。",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentPageSession();
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen bg-transparent text-slate-900">
          <AppHeader username={session?.username} />
          {children}
          <footer className="border-t border-white/70 bg-white/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-sm text-slate-500 md:flex-row md:items-center md:justify-between md:px-6">
              <div>Operator Studio · 本地部署 · 结果留痕</div>
              <div>任务 · 回放 · 设置</div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
