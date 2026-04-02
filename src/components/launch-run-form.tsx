"use client";

import { useEffect, useMemo, useState } from "react";
import type { BrowserProfileRecord } from "@/features/browser-profiles/browser-profile.types";
import type { AiConnectionRecord } from "@/features/ai-connections/ai-connection.types";
import type { GovernanceSettings } from "@/features/governance/governance.types";
import type { RunView } from "@/features/runs/run.types";
import type { ExecutionTemplate } from "@/features/templates/template.types";
import { domainMeta, lifecycleMeta } from "@/lib/presenter";

const targetSuggestions: Record<string, string[]> = {
  "browser-operator": ["https://example.com", "https://www.wikipedia.org", "https://news.ycombinator.com"],
  "media-agent": ["/tmp/operator-media-smoke.wav", "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"],
  "factory-audit": ["ESD 现场审计", "5S 巡检", "设备点检"],
};

const executionInputDefaults: Record<string, string> = {
  "browser-operator": JSON.stringify(
    {
      url: "https://example.com/login",
      waitUntil: "networkidle",
      timeoutMs: 30000,
      captureHtml: true,
      captureScreenshot: true,
      saveStorageState: true,
      persistProfileStorageState: true,
      secrets: {
        username: "demo",
        password: "secret",
      },
      totp: {
        secret: "JBSWY3DPEHPK3PXP",
        issuer: "Operator Studio",
        accountName: "demo",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
      actions: [
        { type: "fillSecret", selector: "#username", key: "username", label: "填用户名" },
        { type: "fillSecret", selector: "#password", key: "password", label: "填密码" },
        { type: "click", selector: "button[type='submit']", label: "提交" },
      ],
    },
    null,
    2,
  ),
  "media-agent": JSON.stringify(
    {
      source: "/tmp/operator-media-smoke.wav",
      archiveName: "operator-media-smoke.wav",
      extractFrame: true,
      deliveryDir: "/tmp/operator-media-delivery",
      deliveryWebhookUrl: "https://example.com/operator-webhook",
    },
    null,
    2,
  ),
  "factory-audit": JSON.stringify(
    {
      site: "ESD 包装线",
      lineName: "3F 包装工位",
      auditTitle: "ESD 审计",
      owner: "制造工程",
      exportDir: "/tmp/operator-factory-export",
      exportPptx: true,
    },
    null,
    2,
  ),
};

export function LaunchRunForm({
  templates,
  governance,
  browserProfiles,
  aiConnections,
}: {
  templates: ExecutionTemplate[];
  governance: GovernanceSettings;
  browserProfiles: BrowserProfileRecord[];
  aiConnections: AiConnectionRecord[];
}) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("https://example.com");
  const [operatorNote, setOperatorNote] = useState("");
  const [executionInput, setExecutionInput] = useState(executionInputDefaults[templates[0]?.id ?? "browser-operator"] ?? "{}");
  const [lifecycle, setLifecycle] = useState<"temporary" | "persistent">(governance.defaultLifecycle);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedAiConnectionId, setSelectedAiConnectionId] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? templates[0],
    [templateId, templates],
  );

  const defaultAiConnection = useMemo(
    () => aiConnections.find((connection) => connection.id === governance.defaultAiConnectionId) ?? null,
    [aiConnections, governance.defaultAiConnectionId],
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    setExecutionInput(executionInputDefaults[selectedTemplate.id] ?? "{}");
    setSelectedProfileId("");
    setSelectedAiConnectionId("");
    setError(null);
    const firstSuggestion = targetSuggestions[selectedTemplate.id]?.[0];
    if (firstSuggestion) setTarget(firstSuggestion);
  }, [selectedTemplate]);

  const templateSuggestions = targetSuggestions[selectedTemplate?.id ?? ""] ?? [];
  const domain = selectedTemplate ? domainMeta[selectedTemplate.domain] : null;
  const lifecycleInfo = lifecycleMeta[lifecycle];

  function patchExecutionInput(mutator: (draft: Record<string, unknown>) => void, errorMessage: string) {
    try {
      const parsed = executionInput.trim() ? (JSON.parse(executionInput) as Record<string, unknown>) : {};
      mutator(parsed);
      setExecutionInput(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      setError(errorMessage);
    }
  }

  function injectCredentialProfile() {
    if (!selectedProfileId) return;
    patchExecutionInput((parsed) => {
      parsed.credentialProfileId = selectedProfileId;
    }, "高级参数 JSON 不合法，无法写入浏览器资料");
  }

  function applyAiConnection(connectionId: string) {
    setSelectedAiConnectionId(connectionId);
    patchExecutionInput((parsed) => {
      if (connectionId) parsed.aiConnectionId = connectionId;
      else delete parsed.aiConnectionId;
    }, "高级参数 JSON 不合法，无法写入 AI 连接");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, title, target, operatorNote, lifecycle, executionInput }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "创建任务失败");
      const run = payload.data as RunView;
      window.location.href = `/runs/${run.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="section-card overflow-hidden p-6 md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="section-kicker">新建任务</div>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">快速发起</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${lifecycleInfo.badgeClass}`}>{lifecycleInfo.label}</span>
          <span className="badge border-slate-200 bg-white text-slate-700">并发 {governance.maxConcurrentRuns}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              任务模板
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-shell">
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              运行方式
              <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as "temporary" | "persistent")} className="input-shell">
                <option value="persistent">常驻</option>
                <option value="temporary">临时</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            任务名称
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-shell"
              placeholder="例如：夜间巡检 / 图片审计 / 登录验证"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            目标
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="input-shell"
              placeholder="网址、文件路径或审计主题"
            />
          </label>

          {templateSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {templateSuggestions.map((item) => (
                <button key={item} type="button" onClick={() => setTarget(item)} className="pill-button">
                  {item}
                </button>
              ))}
            </div>
          ) : null}

          {selectedTemplate?.id === "browser-operator" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">浏览器资料</div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <label className="block text-sm font-medium text-slate-700">
                  选择资料
                  <select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)} className="input-shell">
                    <option value="">不使用</option>
                    {browserProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={injectCredentialProfile}
                  disabled={!selectedProfileId}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  使用这份资料
                </button>
              </div>
            </div>
          ) : null}

          {selectedTemplate?.id === "factory-audit" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">图片理解连接</div>
              <label className="mt-3 block text-sm font-medium text-slate-700">
                连接
                <select value={selectedAiConnectionId} onChange={(e) => applyAiConnection(e.target.value)} className="input-shell">
                  <option value="">
                    跟随默认（{defaultAiConnection ? `${defaultAiConnection.name} / ${defaultAiConnection.model}` : "未设置"}）
                  </option>
                  {aiConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name} / {connection.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            备注
            <textarea
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              className="textarea-shell"
              placeholder="可选，例如：交付前截图、生成 PPT、保留回放"
            />
          </label>

          <details className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">高级参数</summary>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              JSON
              <textarea
                value={executionInput}
                onChange={(e) => setExecutionInput(e.target.value)}
                className="textarea-shell min-h-[220px] font-mono text-xs"
                placeholder='{"site":"ESD 现场","exportPptx":true}'
              />
            </label>
          </details>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">
              默认：{governance.defaultLifecycle === "persistent" ? "常驻" : "临时"} · 视觉验收
              {governance.visualVerificationRequired ? "开启" : "关闭"}
            </div>
            <button
              disabled={submitting}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "创建中..." : "启动任务"}
            </button>
          </div>
        </div>

        <div className="rounded-[28px] bg-slate-950 p-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            {domain ? <span className={`badge ${domain.badgeClass}`}>{domain.label}</span> : null}
            <span className="badge border-white/10 bg-white/10 text-white">{selectedTemplate?.steps.length ?? 0} 步</span>
          </div>
          <h4 className="mt-4 text-2xl font-bold">{selectedTemplate?.name}</h4>
          <p className="mt-3 text-sm leading-6 text-slate-300">{selectedTemplate?.summary}</p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="text-xs tracking-[0.18em] text-white/45">适用场景</div>
            <div className="mt-2 leading-6">{selectedTemplate?.goal}</div>
          </div>

          <div className="mt-4 space-y-3">
            {selectedTemplate?.steps.map((step, index) => (
              <div key={step.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm font-semibold text-white">
                  {index + 1}. {step.title}
                </div>
                <div className="mt-1 text-sm text-slate-300">{step.description}</div>
              </div>
            ))}
          </div>

          {selectedTemplate?.id === "factory-audit" ? (
            <div className="mt-4 rounded-2xl border border-brand-300/20 bg-brand-400/10 p-4 text-sm leading-6 text-slate-200">
              当前默认 AI：{defaultAiConnection ? `${defaultAiConnection.name} / ${defaultAiConnection.model}` : "未设置"}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
