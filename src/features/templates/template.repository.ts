import type { ExecutionTemplate } from "./template.types";

const templates: ExecutionTemplate[] = [
  {
    id: "browser-operator",
    name: "Browser Operator",
    summary: "面向无 API 门户的执行型 agent，强调复杂登录流、MFA/TOTP、动作 DSL、会话注入、多页面流转、下载留痕、凭据 profile 复用与回放追责。",
    domain: "browser",
    goal: "完成跨门户、跨表单、跨后台的稳定执行闭环。",
    modelPolicy: {
      defaultModel: "openai-codex/gpt-5.4",
      fallbackModel: "openai-codex/gpt-5.4-mini",
      verification: "understand_image + structured replay",
    },
    runtimeHints: [
      "适合采购、财务、运营、后台录入等低频高价值流程",
      "执行策略应先 DOM 再视觉，再回退人工接管",
    ],
    steps: [
      { id: "plan", title: "Plan", description: "读取目标、环境、权限边界，生成执行计划。", durationSec: 12, toolHint: "planner", evidenceHint: "plan.json" },
      { id: "open", title: "Open Target", description: "打开目标站点并确认登录态、窗口态；需要时注入 header/cookie/basicAuth/storageState。", durationSec: 15, toolHint: "browser", evidenceHint: "screenshot:start" },
      { id: "execute", title: "Execute DOM Actions", description: "优先走 DOM 级操作，支持复杂登录、多步跳转、fillSecret/fillTotp、waitForUrl/waitForLoadState、多页面切换与浏览器下载。", durationSec: 28, toolHint: "playwright", evidenceHint: "dom-trace.json" },
      { id: "verify", title: "Verify", description: "做视觉核验与结果对账。", durationSec: 16, toolHint: "understand_image", evidenceHint: "verification.md" },
      { id: "handoff", title: "Replay Pack", description: "沉淀回放包与异常定位信息。", durationSec: 8, toolHint: "artifact-pack", evidenceHint: "replay.zip" },
    ],
  },
  {
    id: "media-agent",
    name: "Media Delivery Agent",
    summary: "面向图像/视频生成与多渠道投递，强调鉴权拉取、submit/query/download 与目录投递 / webhook 重试外发分离。",
    domain: "media",
    goal: "让媒体任务可重试、可下载、可验收、可分发。",
    modelPolicy: {
      defaultModel: "minimax/MiniMax-M2.7-highspeed",
      fallbackModel: "zai/glm-4.6v-flash",
      verification: "frame/sample visual QA",
    },
    runtimeHints: [
      "生成链路和分发链路要拆开监控",
      "前端 fetch failed 不能直接等价于上游任务失败",
    ],
    steps: [
      { id: "prepare", title: "Prepare Assets", description: "标准化素材、提示词、目标规格。", durationSec: 10, toolHint: "media-prep", evidenceHint: "request.json" },
      { id: "submit", title: "Submit Job", description: "提交到上游模型或鉴权源地址，记录 request/task_id。", durationSec: 12, toolHint: "model-api", evidenceHint: "submit.log" },
      { id: "poll", title: "Poll Status", description: "轮询 query，直到成功/失败并留痕。", durationSec: 24, toolHint: "poller", evidenceHint: "query.log" },
      { id: "download", title: "Download Result", description: "从 result_url 下载结果，落本地文件库。", durationSec: 14, toolHint: "downloader", evidenceHint: "artifact.mp4" },
      { id: "deliver", title: "Deliver", description: "分发到本地目录或 webhook，记录 checksum、回执和失败点。", durationSec: 10, toolHint: "channel-router", evidenceHint: "delivery.log" },
    ],
  },
  {
    id: "factory-audit",
    name: "Factory Audit Agent",
    summary: "面向生产线整改、审计与报告输出，强调证据归档、元数据清单、单图+多图 vision provider、标准映射、优先级排序与 HTML/PPTX 交付。",
    domain: "manufacturing",
    goal: "把现场证据、标准映射、整改建议、汇报材料形成闭环。",
    modelPolicy: {
      defaultModel: "openai-codex/gpt-5.4",
      fallbackModel: "minimax/MiniMax-M2.7-highspeed",
      verification: "multimodal audit + document export",
    },
    runtimeHints: [
      "适合 ESD、5S、工艺整改、设备点检",
      "标准映射与参数表必须可追溯，不要只给结论",
    ],
    steps: [
      { id: "collect", title: "Collect Evidence", description: "汇总照片、视频、规范与设备清单，提取 mime/尺寸/sha256 等元数据，并可调用单图 vision + 多图联合理解补现场摘要与跨图 findings。", durationSec: 11, toolHint: "vision-intake", evidenceHint: "evidence-index.json" },
      { id: "map", title: "Map Standards", description: "把问题点映射到标准要求与 KPI。", durationSec: 17, toolHint: "knowledge-map", evidenceHint: "controls.md" },
      { id: "prioritize", title: "Prioritize", description: "输出 P0/P1/P2 整改顺序与 ROI。", durationSec: 13, toolHint: "planner", evidenceHint: "priority.csv" },
      { id: "export", title: "Export Deck", description: "生成 HTML/Markdown/PPTX 等对外交付物。", durationSec: 16, toolHint: "ppt-engine", evidenceHint: "deck.pptx" },
      { id: "review", title: "Review", description: "做最终 QA，确保参数、页数、结构都可用。", durationSec: 9, toolHint: "qa", evidenceHint: "review.log" },
    ],
  },
];

export async function listTemplates(): Promise<ExecutionTemplate[]> {
  return templates;
}

export async function getTemplateById(id: string): Promise<ExecutionTemplate | undefined> {
  return templates.find((template) => template.id === id);
}
