import type { GovernanceStatus } from "@/features/governance/governance.types";
import type { RunView } from "@/features/runs/run.types";
import {
  domainMeta,
  formatDateTime,
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
  if (run.riskFlags.includes("no-replay-pack")) return 4;
  return 5;
}

export function ActionBoard({ runs, governance }: { runs: RunView[]; governance: GovernanceStatus }) {
  const topRuns = [...runs].sort((a, b) => priorityOf(a) - priorityOf(b)).slice(0, 5);
  const attentionCount = runs.filter((run) => run.status === "attention").length;
  const runningCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const replayMissingCount = runs.filter((run) => run.riskFlags.includes("no-replay-pack")).length;
  const workerMeta = workerStatusMeta[governance.worker.status];

  return (
    <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
      <div className="section-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="section-kicker">Operator Copilot</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">当前最值得盯的动作</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">把 run 状态压成短摘要、下一步建议和风险提示。先看这里，再决定要不要深挖 event log。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`badge ${workerMeta.badgeClass}`}>worker {workerMeta.label}</span>
            <span className="badge border-slate-200 bg-white text-slate-700">活跃 {runningCount}</span>
            <span className="badge border-slate-200 bg-white text-slate-700">待介入 {attentionCount}</span>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {topRuns.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm leading-6 text-slate-500">
              还没有 run。先发起一个，把目标、生命周期和操作说明收口，系统才能开始积累回放、日志和证据包。
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
                  className={`block overflow-hidden rounded-[24px] border bg-gradient-to-br p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft ${status.accentClass}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${domain.badgeClass}`}>{domain.label}</span>
                        <span className={`badge ${lifecycle.badgeClass}`}>{lifecycle.label}</span>
                        <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                      </div>
                      <div className="mt-3 text-lg font-bold text-slate-950">{run.title}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{run.assistantSummary}</div>
                      <div className="mt-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700">
                        <span className="font-semibold text-slate-900">下一步：</span>
                        {run.nextAction}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {run.riskFlags.length === 0 ? (
                          <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">当前无额外风险</span>
                        ) : (
                          run.riskFlags.slice(0, 4).map((flag) => (
                            <span key={flag} className="badge border-slate-200 bg-white/90 text-slate-700">
                              {flag}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="w-full rounded-[22px] border border-white/70 bg-white/85 p-4 lg:max-w-[290px]">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>进度</span>
                        <span className="font-semibold text-slate-900">{formatPercent(run.progressPercent)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(8, run.progressPercent)}%` }} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-600">
                          <div className="text-xs text-slate-400">事件</div>
                          <div className="mt-1 font-semibold text-slate-900">{run.eventsCount}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-600">
                          <div className="text-xs text-slate-400">附件</div>
                          <div className="mt-1 font-semibold text-slate-900">{run.artifactsCount}</div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                        <div>当前步骤：<span className="font-medium text-slate-700">{run.currentStepTitle ?? "未开始"}</span></div>
                        <div>最后更新：<span className="font-medium text-slate-700">{formatRelativeTime(run.updatedAt)}</span></div>
                        <div className="text-slate-400">{formatDateTime(run.updatedAt)}</div>
                      </div>
                      <div className="mt-4 inline-flex rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">查看详情 →</div>
                    </div>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="section-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Worker status</div>
              <div className="mt-2 text-2xl font-bold text-slate-950">{workerMeta.label}</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">{workerMeta.hint}</p>
            </div>
            <span className={`badge ${workerMeta.badgeClass}`}>{governance.worker.status}</span>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <div>最后心跳：<span className="font-medium text-slate-900">{formatRelativeTime(governance.worker.heartbeatAt)}</span></div>
            <div className="mt-1 text-xs text-slate-500">{governance.worker.heartbeatAt ?? "暂无"}</div>
          </div>
        </div>

        <div className="section-card p-5">
          <div className="section-kicker">治理默认</div>
          <h3 className="mt-2 text-xl font-bold text-slate-950">策略快照</h3>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span>默认生命周期</span>
              <span className="font-semibold text-slate-900">{governance.settings.defaultLifecycle === "persistent" ? "常驻" : "临时"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span>最大并发 run</span>
              <span className="font-semibold text-slate-900">{governance.settings.maxConcurrentRuns}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span>每日预算</span>
              <span className="font-semibold text-slate-900">{governance.settings.dailyRunBudget}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span>视觉验收</span>
              <span className="font-semibold text-slate-900">{governance.settings.visualVerificationRequired ? "必须" : "可选"}</span>
            </div>
          </div>
        </div>

        <div className="section-card p-5">
          <div className="section-kicker">Focus list</div>
          <h3 className="mt-2 text-xl font-bold text-slate-950">当前系统关注点</h3>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">待人工介入：<span className="font-semibold text-slate-900">{attentionCount}</span></div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">运行中 / 排队：<span className="font-semibold text-slate-900">{runningCount}</span></div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">完成但缺 replay：<span className="font-semibold text-slate-900">{replayMissingCount}</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
