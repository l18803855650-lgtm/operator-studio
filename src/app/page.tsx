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
  const runningRuns = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const persistentRuns = runs.filter((run) => run.lifecycle === "persistent").length;
  const attentionRuns = runs.filter((run) => run.status === "attention").length;
  const completedRuns = runs.filter((run) => run.status === "completed").length;
  const completionRate = totalRuns === 0 ? 0 : Math.round((completedRuns / totalRuns) * 100);
  const replayMissing = runs.filter((run) => run.riskFlags.includes("no-replay-pack")).length;
  const latestRun = [...runs].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const workerMeta = workerStatusMeta[governance.worker.status];

  return (
    <main className="page-shell space-y-8">
      <section className="section-card overflow-hidden p-8">
        <div className="grid gap-8 xl:grid-cols-[1.35fr_0.95fr]">
          <div>
            <div className="section-kicker">Command Center</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-[2.6rem]">
              让执行链路真闭环，
              <span className="text-brand-700">不是只把界面堆得像个壳。</span>
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              这里盯三件事：run 有没有真正推进、证据有没有留下、治理规则有没有被写死到系统里。
              这版界面按中文使用习惯重排了信息层级，优先把「现在该看什么、下一步干什么」摆到最前面。
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-600">
              <span className="badge border-brand-200 bg-brand-50 text-brand-700">中文优先表达</span>
              <span className="badge border-slate-200 bg-white text-slate-700">运行态摘要</span>
              <span className="badge border-slate-200 bg-white text-slate-700">证据 / 回放 / 风险同屏</span>
              <span className="badge border-slate-200 bg-white text-slate-700">治理默认可见</span>
            </div>
          </div>

          <div className="rounded-[28px] bg-slate-950 p-6 text-white shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-200">Studio heartbeat</div>
                <div className="mt-2 text-2xl font-bold">worker {workerMeta.label}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{workerMeta.hint}</p>
              </div>
              <span className={`badge ${workerMeta.badgeClass}`}>{governance.worker.status}</span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-400">最近心跳</div>
                <div className="mt-2 text-lg font-semibold">{formatRelativeTime(governance.worker.heartbeatAt)}</div>
                <div className="mt-1 text-xs text-slate-400">{governance.worker.heartbeatAt ?? "暂无记录"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-400">最新 run 动作</div>
                <div className="mt-2 text-lg font-semibold">{latestRun ? formatRelativeTime(latestRun.updatedAt) : "还没有"}</div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-400">{latestRun?.title ?? "先发起一个 run，才能开始积累回放与证据。"}</div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-brand-300/20 bg-brand-400/10 p-4 text-sm leading-6 text-slate-200">
              当前治理默认：
              <span className="font-semibold text-white"> {governance.settings.defaultLifecycle === "persistent" ? "常驻" : "临时"}</span>
              ，并发
              <span className="font-semibold text-white"> {governance.settings.maxConcurrentRuns}</span>
              ，预算
              <span className="font-semibold text-white"> {governance.settings.dailyRunBudget}</span>
              。
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "总 run", value: totalRuns, tone: "text-slate-900", hint: "沉淀在库里的全部运行记录" },
          { label: "活跃中", value: runningRuns, tone: "text-amber-600", hint: "排队 + 执行中的 run" },
          { label: "待介入", value: attentionRuns, tone: "text-red-600", hint: "需要人工接管的问题单" },
          { label: "常驻 run", value: persistentRuns, tone: "text-brand-700", hint: "长生命周期对象" },
          { label: "完成率", value: `${completionRate}%`, tone: "text-emerald-700", hint: "已完成 / 总数" },
          { label: "缺 replay", value: replayMissing, tone: "text-fuchsia-700", hint: "完成但仍缺回放包" },
        ].map((card) => (
          <div key={card.label} className="section-card p-5">
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className={`mt-2 text-3xl font-black tracking-tight ${card.tone}`}>{card.value}</div>
            <div className="mt-2 text-xs leading-5 text-slate-500">{card.hint}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
        <ActionBoard runs={runs} governance={governance} />
        <LaunchRunForm templates={templates} governance={governance.settings} browserProfiles={browserProfiles} aiConnections={aiConnections} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="section-kicker">Template library</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">可直接套用的执行模板</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Browser / Media / Manufacturing 三条主线都保留了模型策略、步骤、验收方式和适用场景。</p>
          </div>
          <div className="text-sm text-slate-500">当前模板数：{templates.length}</div>
        </div>
        <TemplatesGrid templates={templates} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="section-kicker">Runs overview</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">运行总览 / 中文筛选台</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">按状态、生命周期、领域和关键词直接筛。重点 run 不再淹死在一张原始表里。</p>
          </div>
          <div className="text-sm text-slate-500">最近活跃：{latestRun ? formatRelativeTime(latestRun.updatedAt) : "暂无"}</div>
        </div>
        <RunsTable runs={runs} />
      </section>
    </main>
  );
}
