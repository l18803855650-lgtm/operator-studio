import type { GovernanceStatus } from "@/features/governance/governance.types";
import type { RunView } from "@/features/runs/run.types";
import { formatRelativeTime, runStatusMeta, workerStatusMeta } from "@/lib/presenter";

function priorityOf(run: RunView) {
  if (run.status === "attention") return 0;
  if (run.status === "running") return 1;
  if (run.status === "queued") return 2;
  return 3;
}

export function ActionBoard({ runs, governance }: { runs: RunView[]; governance: GovernanceStatus }) {
  const topRuns = [...runs].sort((a, b) => priorityOf(a) - priorityOf(b)).slice(0, 3);
  const workerMeta = workerStatusMeta[governance.worker.status];
  const attentionCount = runs.filter((run) => run.status === "attention").length;
  const runningCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="section-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">最近任务</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">先看这几个</h2>
          </div>
          <span className="badge border-slate-200 bg-white text-slate-700">{topRuns.length} 条</span>
        </div>

        <div className="mt-5 space-y-3">
          {topRuns.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              还没有任务。
            </div>
          ) : (
            topRuns.map((run) => {
              const status = runStatusMeta[run.status];
              return (
                <a
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="block rounded-[22px] border border-slate-200 bg-white px-4 py-4 transition hover:border-brand-200 hover:shadow-soft"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-950">{run.title}</div>
                    <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{run.nextAction}</div>
                  <div className="mt-3 text-xs text-slate-500">{formatRelativeTime(run.updatedAt)}</div>
                </a>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="section-card p-5">
          <div className="section-kicker">系统状态</div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-2xl font-bold text-slate-950">{workerMeta.label}</div>
            <span className={`badge ${workerMeta.badgeClass}`}>{governance.worker.status}</span>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            最近心跳：<span className="font-semibold text-slate-950">{formatRelativeTime(governance.worker.heartbeatAt)}</span>
          </div>
        </div>

        <div className="section-card p-5">
          <div className="section-kicker">摘要</div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>进行中</span>
              <span className="font-semibold text-slate-950">{runningCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>待处理</span>
              <span className="font-semibold text-slate-950">{attentionCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>默认运行</span>
              <span className="font-semibold text-slate-950">
                {governance.settings.defaultLifecycle === "persistent" ? "常驻" : "临时"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
