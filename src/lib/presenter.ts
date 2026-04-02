import type { GovernanceStatus } from "@/features/governance/governance.types";
import type {
  ArtifactKind,
  RunArtifact,
  RunEventLevel,
  RunLifecycle,
  RunStatus,
  RunStepStatus,
  RunView,
} from "@/features/runs/run.types";
import type { TemplateDomain } from "@/features/templates/template.types";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const runStatusMeta: Record<RunStatus, { label: string; badgeClass: string; accentClass: string }> = {
  queued: {
    label: "排队中",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    accentClass: "from-slate-500/15 to-slate-100",
  },
  running: {
    label: "执行中",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    accentClass: "from-amber-500/15 to-amber-100",
  },
  completed: {
    label: "已完成",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    accentClass: "from-emerald-500/15 to-emerald-100",
  },
  attention: {
    label: "待介入",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    accentClass: "from-red-500/15 to-red-100",
  },
  stopped: {
    label: "已停止",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    accentClass: "from-slate-500/15 to-slate-100",
  },
};

export const runStepStatusMeta: Record<RunStepStatus, { label: string; badgeClass: string; timelineClass: string }> = {
  pending: {
    label: "待执行",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    timelineClass: "border-slate-200 bg-white",
  },
  running: {
    label: "执行中",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    timelineClass: "border-amber-200 bg-amber-50/40",
  },
  completed: {
    label: "已完成",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    timelineClass: "border-emerald-200 bg-emerald-50/40",
  },
  attention: {
    label: "需关注",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    timelineClass: "border-red-200 bg-red-50/40",
  },
  stopped: {
    label: "已停止",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    timelineClass: "border-slate-200 bg-slate-50/80",
  },
};

export const lifecycleMeta: Record<RunLifecycle, { label: string; badgeClass: string }> = {
  temporary: {
    label: "临时",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  persistent: {
    label: "常驻",
    badgeClass: "bg-brand-50 text-brand-700 border-brand-200",
  },
};

export const domainMeta: Record<TemplateDomain, { label: string; badgeClass: string; description: string }> = {
  browser: {
    label: "浏览器执行",
    badgeClass: "bg-brand-50 text-brand-700 border-brand-200",
    description: "DOM-first / 门户自动化 / 截图验收",
  },
  media: {
    label: "媒体生产",
    badgeClass: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    description: "生成 / 下载 / 投递 / 结果留痕",
  },
  manufacturing: {
    label: "制造审计",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "现场问题识别 / 标准映射 / 报告输出",
  },
};

export const workerStatusMeta: Record<GovernanceStatus["worker"]["status"], { label: string; badgeClass: string; hint: string }> = {
  healthy: {
    label: "健康",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    hint: "worker 心跳正常，可持续接单推进。",
  },
  stale: {
    label: "陈旧",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    hint: "worker 心跳过旧，需优先检查服务状态。",
  },
  unknown: {
    label: "未知",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    hint: "还没有拿到有效心跳。",
  },
};

export const artifactKindMeta: Record<ArtifactKind, { label: string; badgeClass: string }> = {
  upload: { label: "手动上传", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" },
  evidence: { label: "证据", badgeClass: "bg-brand-50 text-brand-700 border-brand-200" },
  log: { label: "日志", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  replay: { label: "回放包", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  output: { label: "结果文件", badgeClass: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
};

export const eventLevelMeta: Record<RunEventLevel, { label: string; badgeClass: string }> = {
  info: { label: "信息", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" },
  warn: { label: "警告", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  error: { label: "错误", badgeClass: "bg-red-50 text-red-700 border-red-200" },
};

export function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

export function formatRelativeTime(value?: string) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;

  const diffMs = Date.now() - timestamp;
  const absMs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? "前" : "后";

  if (absMs < 60_000) return diffMs >= 0 ? "刚刚" : "马上";
  const minutes = Math.round(absMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟${suffix}`;
  const hours = Math.round(absMs / 3_600_000);
  if (hours < 24) return `${hours} 小时${suffix}`;
  const days = Math.round(absMs / 86_400_000);
  return `${days} 天${suffix}`;
}

export function formatPercent(value: number) {
  return `${Math.max(0, Math.round(value))}%`;
}

export function inferRunDomain(run: Pick<RunView, "templateId" | "labels">): TemplateDomain {
  if (run.labels.includes("browser") || run.templateId.startsWith("browser")) return "browser";
  if (run.labels.includes("media") || run.templateId.startsWith("media")) return "media";
  return "manufacturing";
}

export function countArtifactsByKind(artifacts: RunArtifact[]) {
  return artifacts.reduce<Record<ArtifactKind, number>>(
    (acc, artifact) => {
      acc[artifact.kind] += 1;
      return acc;
    },
    {
      upload: 0,
      evidence: 0,
      log: 0,
      replay: 0,
      output: 0,
    },
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
