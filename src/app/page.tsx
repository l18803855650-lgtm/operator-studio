import Link from "next/link";
import { listTemplates } from "@/features/templates/template.repository";
import { listRuns } from "@/features/runs/run.service";
import { getGovernanceStatus } from "@/features/governance/governance.service";
import { listBrowserProfiles } from "@/features/browser-profiles/browser-profile.service";
import { listAiConnections } from "@/features/ai-connections/ai-connection.service";
import { TemplatesGrid } from "@/components/templates-grid";
import { RunsTable } from "@/components/runs-table";
import { LaunchRunForm } from "@/components/launch-run-form";
import { ActionBoard } from "@/components/action-board";
import { requirePageSession } from "@/lib/auth";
import { formatRelativeTime, workerStatusMeta } from "@/lib/presenter";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePageSession();
  const [templates, runs, governance, browserProfiles, aiConnections] = await Promise.all([
    listTemplates(),
    listRuns(),
    getGovernanceStatus(),
    listBrowserProfiles(),
    listAiConnections(),
  ]);

  const totalRuns = runs.length;
  const activeRuns = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const attentionRuns = runs.filter((run) => run.status === "attention").length;
  const completedRuns = runs.filter((run) => run.status === "completed").length;
  const completionRate = totalRuns === 0 ? 0 : Math.round((completedRuns / totalRuns) * 100);
  const latestRun = [...runs].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const workerMeta = workerStatusMeta[governance.worker.status];
  const defaultAiConnection = aiConnections.find((item) => item.id === governance.settings.defaultAiConnectionId) ?? null;

  return (
    <main className="page-shell space-y-6">
      <section className="section-card overflow-hidden p-6 md:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr] xl:items-stretch">
          <div className="rounded-[28px] bg-slate-950 p-7 text-white">
            <div className="section-kicker text-white/55">工作台</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-[2.7rem]">
              把任务交给系统，
              <span className="text-brand-300">不是交给一堆说明文字。</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              首页只保留三件事：当前任务、快速发起、结果总览。复杂配置留到设置页，不在首页铺满。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#new-run" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                新建任务
              </a>
              <Link
                href="/governance"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                打开设置
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="section-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">运行状态</div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">{workerMeta.label}</div>
                </div>
                <span className={`badge ${workerMeta.badgeClass}`}>{governance.worker.status}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">最近心跳</div>
                  <div className="mt-1 font-semibold text-slate-950">{formatRelativeTime(governance.worker.heartbeatAt)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">最新任务</div>
                  <div className="mt-1 font-semibold text-slate-950">{latestRun ? formatRelativeTime(latestRun.updatedAt) : "暂无"}</div>
                </div>
              </div>
            </div>

            <div className="section-card p-5">
              <div className="section-kicker">默认连接</div>
              <div className="mt-2 text-lg font-bold text-slate-950">
                {defaultAiConnection ? defaultAiConnection.name : "未设置默认 AI 连接"}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                {defaultAiConnection ? `${defaultAiConnection.model} · ${defaultAiConnection.baseUrl}` : "工厂图片理解可直接走这里，不必手写 webhook。"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "任务总数", value: totalRuns },
          { label: "进行中", value: activeRuns },
          { label: "待处理", value: attentionRuns },
          { label: "完成率", value: `${completionRate}%` },
        ].map((item) => (
          <div key={item.label} className="section-card p-5">
            <div className="text-sm text-slate-500">{item.label}</div>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_1.15fr]">
        <ActionBoard runs={runs} governance={governance} />
        <div id="new-run">
          <LaunchRunForm
            templates={templates}
            governance={governance.settings}
            browserProfiles={browserProfiles}
            aiConnections={aiConnections}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="section-kicker">任务模板</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">先选要做什么</h2>
          </div>
          <div className="text-sm text-slate-500">{templates.length} 个模板</div>
        </div>
        <TemplatesGrid templates={templates} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="section-kicker">任务列表</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">最近任务</h2>
          </div>
          <div className="text-sm text-slate-500">最近更新：{latestRun ? formatRelativeTime(latestRun.updatedAt) : "暂无"}</div>
        </div>
        <RunsTable runs={runs} />
      </section>
    </main>
  );
}
