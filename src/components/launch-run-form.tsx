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
  "factory-audit": ["ESD 现场审计 + PPT 输出", "5S 巡检问题归档", "设备点检与整改建议"],
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
        { type: "click", selector: "button[type='submit']", label: "提交首步登录" },
        { type: "waitForUrl", expected: "/otp", label: "等待 OTP 页" },
        { type: "waitForLoadState", state: "networkidle", label: "等待 OTP 页稳定" },
        { type: "fillTotp", selector: "#otp-code", label: "填写 TOTP" },
        { type: "click", selector: "button[type='submit']", label: "提交 OTP" },
        { type: "waitForUrl", expected: "/dashboard", label: "等待进入后台" },
        { type: "saveProfileStorageState", label: "回写 profile 登录态" },
        { type: "screenshot", label: "后台截图", fullPage: true },
      ],
      note: "支持复杂登录流、多步跳转、secrets/TOTP、storage state 回写、多页面切换、下载留痕和 replay。",
    },
    null,
    2,
  ),
  "media-agent": JSON.stringify(
    {
      source: "/tmp/operator-media-smoke.wav",
      archiveName: "operator-media-smoke.wav",
      extractFrame: true,
      sourceHeaders: {
        "x-media-auth": "token",
      },
      sourceCookies: [
        {
          name: "media_token",
          value: "demo",
        },
      ],
      sourceRetries: 2,
      sourceBackoffMs: 600,
      deliveryDir: "/tmp/operator-media-delivery",
      deliveryWebhookUrl: "https://example.com/operator-webhook",
      deliveryWebhookHeaders: {
        "x-operator-source": "operator-studio",
      },
      deliveryWebhookRetries: 2,
      deliveryWebhookBackoffMs: 600,
      emitChecksums: true,
      note: "支持鉴权拉取、归档、probe、checksum manifest、replay，并可投递到本地目录或 webhook。",
    },
    null,
    2,
  ),
  "factory-audit": JSON.stringify(
    {
      site: "ESD 包装线",
      lineName: "3F 包装工位",
      auditTitle: "ESD 包装线审计闭环",
      owner: "制造工程",
      findings: [
        {
          title: "人员进入工位前未确认手环接地",
          severity: "P0",
          standardCode: "ESD-GROUND",
          recommendation: "上线前强制做手环测试并记录责任人。",
        },
      ],
      checklist: ["工位标识清晰", "静电防护流程可追溯"],
      exportDir: "/tmp/operator-factory-export",
      exportPptx: true,
      presentationTitle: "ESD 包装线审计汇报版",
      note: "如果治理页已设默认 AI 连接，这里可以不再手填 aiConnectionId；也支持继续走单图 / 多图 webhook。",
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
  const [operatorNote, setOperatorNote] = useState("默认要求：执行要留证，异常要有下一步建议，重要界面尽量中文化展示。");
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
    }, "当前 executor 输入 JSON 不合法，无法注入 credentialProfileId");
  }

  function applyAiConnection(connectionId: string) {
    setSelectedAiConnectionId(connectionId);
    patchExecutionInput((parsed) => {
      if (connectionId) parsed.aiConnectionId = connectionId;
      else delete parsed.aiConnectionId;
    }, "当前 executor 输入 JSON 不合法，无法自动写入 aiConnectionId");
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
      if (!response.ok) throw new Error(payload?.error?.message ?? "Failed to create run");
      const run = payload.data as RunView;
      window.location.href = `/runs/${run.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="section-card overflow-hidden p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="section-kicker">Launch new run</div>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">发起一个真实会跑的任务</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            不只是选模板。这里会把目标、默认规则、凭据资料和执行输入一起收口，让 browser / media / factory 真正跑起来。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${lifecycleInfo.badgeClass}`}>{lifecycleInfo.label}</span>
          <span className="badge border-slate-200 bg-white text-slate-700">并发 {governance.maxConcurrentRuns}</span>
          <span className="badge border-slate-200 bg-white text-slate-700">轮询 {governance.workerPollIntervalMs}ms</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              模板
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-shell">
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              生命周期
              <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as "temporary" | "persistent")} className="input-shell">
                <option value="persistent">常驻：长期挂着，适合持续任务</option>
                <option value="temporary">临时：做完即停，适合一次性任务</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            run 标题（可选）
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-shell"
              placeholder="例如：夜间收口 browser 登录验收 / 工厂审计输出 PPT"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            目标 / 入口对象
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="input-shell"
              placeholder="Browser 填 URL；Media 填 URL/绝对路径；Factory 填产线或审计主题"
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
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block text-sm font-medium text-slate-700">
                Browser credential profile
                <select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)} className="input-shell">
                  <option value="">不使用 profile（直接吃下方 JSON）</option>
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
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                注入 credentialProfileId
              </button>
            </div>
          ) : null}

          {selectedTemplate?.id === "factory-audit" ? (
            <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <label className="block text-sm font-medium text-slate-700">
                Factory 图片理解连接
                <select value={selectedAiConnectionId} onChange={(e) => applyAiConnection(e.target.value)} className="input-shell">
                  <option value="">
                    跟随治理默认（{defaultAiConnection ? `${defaultAiConnection.name} / ${defaultAiConnection.model}` : "当前未设置"}）
                  </option>
                  {aiConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name} / {connection.model}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm leading-6 text-slate-500">
                不想手改 JSON，直接在这里选。系统会自动写入或移除 <code>aiConnectionId</code>；如果留空，就走治理页里的默认连接。
              </div>
            </div>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            executor 输入 JSON
            <textarea
              value={executionInput}
              onChange={(e) => setExecutionInput(e.target.value)}
              className="textarea-shell min-h-[180px] font-mono text-xs"
              placeholder='例如：{"url":"https://example.com/login","credentialProfileId":"...","persistProfileStorageState":true} / {"source":"https://...","sourceHeaders":{...},"deliveryWebhookUrl":"https://..."} / {"site":"ESD 产线","exportPptx":true}'
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            操作说明 / 交接备注
            <textarea
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              className="textarea-shell"
              placeholder="把你想让我额外盯住的点写进来，例如：必须保留回放包、界面尽量中文化、失败后优先补截图。"
            />
          </label>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-sm leading-6 text-slate-500">
              当前治理默认：{governance.defaultLifecycle === "persistent" ? "常驻" : "临时"} / 并发 {governance.maxConcurrentRuns} / 轮询 {governance.workerPollIntervalMs}ms
            </div>
            <button
              disabled={submitting}
              className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "创建中..." : "启动 run"}
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-950 p-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            {domain ? <span className={`badge ${domain.badgeClass}`}>{domain.label}</span> : null}
            <span className="badge border-white/10 bg-white/10 text-white">{selectedTemplate?.steps.length ?? 0} 个步骤</span>
            <span className="badge border-emerald-200/20 bg-emerald-400/10 text-emerald-100">真实 executor</span>
          </div>
          <h4 className="mt-4 text-xl font-bold">模板情报</h4>
          <p className="mt-2 text-sm leading-6 text-slate-300">{selectedTemplate?.summary}</p>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="font-semibold text-white">目标</div>
            <div className="mt-2 leading-6">{selectedTemplate?.goal}</div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="font-semibold text-white">这次会怎么跑</div>
            <div className="mt-2 leading-6">
              {selectedTemplate?.id === "browser-operator"
                ? "真实打开 URL，支持复杂登录流、DOM action DSL、Header/Cookie/basicAuth/storageStatePath 注入、secrets/TOTP、多页面切换、下载留痕和会话回写。"
                : selectedTemplate?.id === "media-agent"
                  ? "真实拉取或归档媒体输入，支持鉴权 header/cookie、重试、checksum manifest、replay，并可投递到本地目录或 webhook。"
                  : `真实收口审计证据、单图+多图联合理解、标准映射、优先级、HTML/Markdown/PPTX 报告和 replay 包；${defaultAiConnection ? `当前治理默认 AI 连接是 ${defaultAiConnection.name} / ${defaultAiConnection.model}。` : "如果治理页还没设默认 AI 连接，也可以在左侧直接指定一个。"}`}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {selectedTemplate?.steps.map((step, index) => (
              <div key={step.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">
                    {index + 1}. {step.title}
                  </div>
                  <div className="text-xs text-slate-400">~{step.durationSec}s</div>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">{step.description}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-brand-300/20 bg-brand-400/10 p-4 text-sm leading-6 text-slate-200">
            <div>
              默认模型：<span className="font-semibold text-white">{selectedTemplate?.modelPolicy.defaultModel}</span>
            </div>
            <div className="mt-1">
              回退模型：<span className="font-semibold text-white">{selectedTemplate?.modelPolicy.fallbackModel}</span>
            </div>
            <div className="mt-1">
              验收方式：<span className="font-semibold text-white">{selectedTemplate?.modelPolicy.verification}</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
