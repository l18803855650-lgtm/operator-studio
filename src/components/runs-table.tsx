"use client";

import { useMemo, useState } from "react";
import type { RunView } from "@/features/runs/run.types";
import {
  domainMeta,
  formatPercent,
  formatRelativeTime,
  inferRunDomain,
  lifecycleMeta,
  runStatusMeta,
} from "@/lib/presenter";

const statusFilters = [
  { value: "all", label: "全部状态" },
  { value: "running", label: "进行中" },
  { value: "attention", label: "待处理" },
  { value: "completed", label: "已完成" },
  { value: "stopped", label: "已停止" },
] as const;

const lifecycleFilters = [
  { value: "all", label: "全部类型" },
  { value: "persistent", label: "常驻" },
  { value: "temporary", label: "临时" },
] as const;

const domainFilters = [
  { value: "all", label: "全部" },
  { value: "browser", label: "浏览器" },
  { value: "media", label: "资料处理" },
  { value: "manufacturing", label: "现场审计" },
] as const;

export function RunsTable({ runs }: { runs: RunView[] }) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<(typeof statusFilters)[number]["value"]>("all");
  const [lifecycle, setLifecycle] = useState<(typeof lifecycleFilters)[number]["value"]>("all");
  const [domain, setDomain] = useState<(typeof domainFilters)[number]["value"]>("all");

  const filteredRuns = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return runs.filter((run) => {
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
    }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [domain, keyword, lifecycle, runs, status]);

  return (
    <div className="section-card overflow-hidden">
      <div className="border-b border-slate-200/80 px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-950">任务列表</h3>
            <p className="mt-1 text-sm text-slate-500">保留最常用的筛选，别的都先藏起来。</p>
          </div>
          <div className="text-sm text-slate-500">
            显示 {filteredRuns.length} / {runs.length}
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[1.6fr_repeat(3,minmax(0,1fr))]">
          <label className="block text-sm font-medium text-slate-700 xl:col-span-1">
            搜索
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="标题、目标、摘要、下一步"
              className="input-shell"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            状态
            <select value={status} onChange={(e) => setStatus(e.target.value as (typeof statusFilters)[number]["value"])} className="input-shell">
              {statusFilters.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            类型
            <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as (typeof lifecycleFilters)[number]["value"])} className="input-shell">
              {lifecycleFilters.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            领域
            <select value={domain} onChange={(e) => setDomain(e.target.value as (typeof domainFilters)[number]["value"])} className="input-shell">
              {domainFilters.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50/85 text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">任务</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">进度</th>
              <th className="px-5 py-3 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                  没有命中的任务。
                </td>
              </tr>
            ) : (
              filteredRuns.map((run) => {
                const statusInfo = runStatusMeta[run.status];
                const lifecycleInfo = lifecycleMeta[run.lifecycle];
                const domainInfo = domainMeta[inferRunDomain(run)];
                return (
                  <tr key={run.id} className="border-t border-slate-100 align-top transition hover:bg-brand-50/20">
                    <td className="px-5 py-4">
                      <a href={`/runs/${run.id}`} className="font-semibold text-slate-950 hover:text-brand-700">
                        {run.title}
                      </a>
                      <div className="mt-1 text-xs text-slate-500">{run.target}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`badge ${domainInfo.badgeClass}`}>{domainInfo.label}</span>
                        <span className={`badge ${lifecycleInfo.badgeClass}`}>{lifecycleInfo.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <span className={`badge ${statusInfo.badgeClass}`}>{statusInfo.label}</span>
                      <div className="mt-2 max-w-sm text-sm leading-6 text-slate-700">{run.assistantSummary}</div>
                      <div className="mt-2 text-xs text-slate-500">下一步：{run.nextAction}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="font-semibold text-slate-950">{formatPercent(run.progressPercent)}</div>
                      <div className="mt-2 text-xs text-slate-500">步骤：{run.currentStepTitle ?? "未开始"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        事件 {run.eventsCount} · 附件 {run.artifactsCount}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{formatRelativeTime(run.updatedAt)}</div>
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
