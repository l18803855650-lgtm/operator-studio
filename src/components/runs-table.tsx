"use client";

import { useMemo, useState } from "react";
import type { RunView } from "@/features/runs/run.types";
import {
  domainMeta,
  formatDateTime,
  formatPercent,
  formatRelativeTime,
  inferRunDomain,
  lifecycleMeta,
  runStatusMeta,
} from "@/lib/presenter";

const statusFilters = [
  { value: "all", label: "全部状态" },
  { value: "running", label: "执行中 / 排队" },
  { value: "attention", label: "待介入" },
  { value: "completed", label: "已完成" },
  { value: "stopped", label: "已停止" },
] as const;

const lifecycleFilters = [
  { value: "all", label: "全部生命周期" },
  { value: "persistent", label: "常驻" },
  { value: "temporary", label: "临时" },
] as const;

const domainFilters = [
  { value: "all", label: "全部领域" },
  { value: "browser", label: "浏览器执行" },
  { value: "media", label: "媒体生产" },
  { value: "manufacturing", label: "制造审计" },
] as const;

const sortOptions = [
  { value: "updatedAt", label: "按最近更新时间" },
  { value: "progress", label: "按进度" },
  { value: "risk", label: "按风险优先" },
] as const;

function riskWeight(run: RunView) {
  let score = 0;
  if (run.status === "attention") score += 100;
  if (run.status === "running") score += 70;
  if (run.status === "queued") score += 60;
  if (run.riskFlags.includes("no-replay-pack")) score += 30;
  if (run.lifecycle === "persistent") score += 10;
  return score;
}

export function RunsTable({ runs }: { runs: RunView[] }) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<(typeof statusFilters)[number]["value"]>("all");
  const [lifecycle, setLifecycle] = useState<(typeof lifecycleFilters)[number]["value"]>("all");
  const [domain, setDomain] = useState<(typeof domainFilters)[number]["value"]>("all");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]["value"]>("updatedAt");

  const filteredRuns = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const next = runs.filter((run) => {
      const runDomain = inferRunDomain(run);
      const matchKeyword =
        !normalizedKeyword ||
        [run.title, run.goal, run.target, run.assistantSummary, run.nextAction].some((field) =>
          field.toLowerCase().includes(normalizedKeyword),
        );
      const matchStatus =
        status === "all"
          ? true
          : status === "running"
            ? run.status === "running" || run.status === "queued"
            : run.status === status;
      const matchLifecycle = lifecycle === "all" ? true : run.lifecycle === lifecycle;
      const matchDomain = domain === "all" ? true : runDomain === domain;
      return matchKeyword && matchStatus && matchLifecycle && matchDomain;
    });

    next.sort((a, b) => {
      if (sortBy === "progress") return b.progressPercent - a.progressPercent;
      if (sortBy === "risk") return riskWeight(b) - riskWeight(a);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });

    return next;
  }, [domain, keyword, lifecycle, runs, sortBy, status]);

  return (
    <div className="section-card overflow-hidden">
      <div className="border-b border-slate-200/80 px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-950">Run 控制台</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">现在这张表可以直接中文筛选和排序，不用把 attention / running / completed 混在一起硬找。</p>
          </div>
          <div className="text-sm text-slate-500">当前显示 {filteredRuns.length} / {runs.length} 个 run</div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
          <label className="block text-sm font-medium text-slate-700 xl:col-span-1">
            搜索关键词
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="按标题 / 目标 / 摘要 / 下一步搜索"
              className="input-shell"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            状态
            <select value={status} onChange={(e) => setStatus(e.target.value as (typeof statusFilters)[number]["value"])} className="input-shell">
              {statusFilters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            生命周期
            <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as (typeof lifecycleFilters)[number]["value"])} className="input-shell">
              {lifecycleFilters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            领域
            <select value={domain} onChange={(e) => setDomain(e.target.value as (typeof domainFilters)[number]["value"])} className="input-shell">
              {domainFilters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            排序
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as (typeof sortOptions)[number]["value"])} className="input-shell">
              {sortOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50/80 text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Run</th>
              <th className="px-5 py-3 font-medium">领域 / 生命周期</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">进度</th>
              <th className="px-5 py-3 font-medium">Assistant brief</th>
              <th className="px-5 py-3 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">没有命中的 run。换个筛选条件，或者先从上面发起一个新的 run。</td>
              </tr>
            ) : (
              filteredRuns.map((run) => {
                const statusInfo = runStatusMeta[run.status];
                const lifecycleInfo = lifecycleMeta[run.lifecycle];
                const domainInfo = domainMeta[inferRunDomain(run)];
                return (
                  <tr key={run.id} className="border-t border-slate-100 align-top transition hover:bg-brand-50/20">
                    <td className="px-5 py-4">
                      <a href={`/runs/${run.id}`} className="font-semibold text-slate-950 hover:text-brand-700">{run.title}</a>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{run.target}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {run.riskFlags.length === 0 ? (
                          <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">无额外风险</span>
                        ) : (
                          run.riskFlags.slice(0, 3).map((flag) => (
                            <span key={flag} className="badge border-slate-200 bg-white text-slate-700">{flag}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <span className={`badge ${domainInfo.badgeClass}`}>{domainInfo.label}</span>
                        <span className={`badge ${lifecycleInfo.badgeClass}`}>{lifecycleInfo.label}</span>
                      </div>
                      <div className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{domainInfo.description}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`badge ${statusInfo.badgeClass}`}>{statusInfo.label}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="w-40 rounded-full bg-slate-100">
                        <div
                          className="rounded-full bg-brand-600 px-2 py-1 text-right text-[11px] font-semibold text-white"
                          style={{ width: `${Math.max(12, run.progressPercent)}%` }}
                        >
                          {formatPercent(run.progressPercent)}
                        </div>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">当前步骤：{run.currentStepTitle ?? "未开始"}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">执行器：{run.executorType} / {run.executionMode === "real" ? "真实执行" : "模拟执行"}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="max-w-md text-sm leading-6 text-slate-700">{run.assistantSummary}</div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">下一步：{run.nextAction}</div>
                      <div className="mt-2 text-xs text-slate-400">events {run.eventsCount} / artifacts {run.artifactsCount}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{formatRelativeTime(run.updatedAt)}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTime(run.updatedAt)}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
