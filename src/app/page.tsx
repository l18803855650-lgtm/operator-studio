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
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr] xl:items-stretch">
          <div className="rounded-[28px] bg-slate-950 p-7 text-white">
            <div className="section-kicker text-white/55">工作台</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-[2.6rem]">
              先把事情跑起来，
              <span className="text-brand-300">别让界面挡路。</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              首页现在只留三类内容：快速发起、最近任务、系统状态。模板说明和全量任务默认折叠。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#quick-run" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
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
                  <div className="section-kicker">系统状态</div>
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
                  <div className="text-xs text-slate-500">默认 AI</div>
                  <div className="mt-1 font-semibold text-slate-950">{defaultAiConnection ? defaultAiConnection.name : "未设置"}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div id="quick-run">
          <LaunchRunForm
            templates={templates}
            governance={governance.settings}
            browserProfiles={browserProfiles}
            aiConnections={aiConnections}
          />
        </div>
        <ActionBoard runs={runs} governance={governance} />
      </section>

      <details className="section-card p-5">
        <summary className="cursor-pointer text-lg font-semibold text-slate-950">查看模板说明</summary>
        <div className="mt-5">
          <TemplatesGrid templates={templates} />
        </div>
      </details>

      <details className="section-card p-5">
        <summary className="cursor-pointer text-lg font-semibold text-slate-950">
          查看全部任务 {latestRun ? `· 最近更新 ${formatRelativeTime(latestRun.updatedAt)}` : ""}
        </summary>
        <div className="mt-5">
          <RunsTable runs={runs} />
        </div>
      </details>
    </main>
  );
}
