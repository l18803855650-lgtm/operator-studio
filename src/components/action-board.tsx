import type { GovernanceStatus } from "@/features/governance/governance.types";
import type { RunView } from "@/features/runs/run.types";
import {
  domainMeta,
  formatPercent,
  formatRelativeTime,
  inferRunDomain,
  lifecycleMeta,
  runStatusMeta,
  workerStatusMeta,
} from "@/lib/presenter";

function priorityOf(run: RunView) {
  if (run.status === "attention") return 0;
  if (run.status === "running") return 1;
  if (run.status === "queued") return 2;
  if (run.status === "stopped") return 3;
  return 4;
}

export function ActionBoard({ runs, governance }: { runs: RunView[]; governance: GovernanceStatus }) {
  const topRuns = [...runs].sort((a, b) => priorityOf(a) - priorityOf(b)).slice(0, 4);
  const attentionCount = runs.filter((run) => run.status === "attention").length;
  const runningCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const workerMeta = workerStatusMeta[governance.worker.status];

  return (
    <section className="grid gap-4 xl:grid-cols-[1.25fr_0.85fr]">
      <div className="section-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">当前任务</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">优先处理</h2>
          </div>
          <span className="badge border-slate-200 bg-white text-slate-700">{topRuns.length} 条</span>
        </div>

        <div className="mt-5 space-y-3">
          {topRuns.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              还没有任务。先从右侧发起一个。
            </div>
          ) : (
            topRuns.map((run) => {
              const status = runStatusMeta[run.status];
              const lifecycle = lifecycleMeta[run.lifecycle];
              const domain = domainMeta[inferRunDomain(run)];
              return (
                <a
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="block rounded-[24px] border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${domain.badgeClass}`}>{domain.label}</span>
                    <span className={`badge ${lifecycle.badgeClass}`}>{lifecycle.label}</span>
                    <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                  </div>
                  <div className="mt-3 text-lg font-semibold text-slate-950">{run.title}</div>
                  <div className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{run.assistantSummary}</div>
                  <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-950">下一步：</span>
                    {run.nextAction}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                    <div>进度 {formatPercent(run.progressPercent)}</div>
                    <div>{formatRelativeTime(run.updatedAt)}</div>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="section-card p-5">
          <div className="section-kicker">运行状态</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-2xl font-bold text-slate-950">{workerMeta.label}</div>
            <span className={`badge ${workerMeta.badgeClass}`}>{governance.worker.status}</span>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            最近心跳：<span className="font-semibold text-slate-950">{formatRelativeTime(governance.worker.heartbeatAt)}</span>
          </div>
        </div>

        <div className="section-card p-5">
          <div className="section-kicker">默认规则</div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>默认运行</span>
              <span className="font-semibold text-slate-950">
                {governance.settings.defaultLifecycle === "persistent" ? "常驻" : "临时"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>并发</span>
              <span className="font-semibold text-slate-950">{governance.settings.maxConcurrentRuns}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>视觉验收</span>
              <span className="font-semibold text-slate-950">
                {governance.settings.visualVerificationRequired ? "开启" : "关闭"}
              </span>
            </div>
          </div>
        </div>

        <div className="section-card p-5">
          <div className="section-kicker">系统提醒</div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>待处理</span>
              <span className="font-semibold text-slate-950">{attentionCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>进行中</span>
              <span className="font-semibold text-slate-950">{runningCount}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
