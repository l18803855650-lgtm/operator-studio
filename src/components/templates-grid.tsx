import type { ExecutionTemplate } from "@/features/templates/template.types";
import { domainMeta } from "@/lib/presenter";

export function TemplatesGrid({ templates }: { templates: ExecutionTemplate[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {templates.map((template) => {
        const domain = domainMeta[template.domain];
        return (
          <div key={template.id} className="section-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`badge ${domain.badgeClass}`}>{domain.label}</span>
              <span className="badge border-slate-200 bg-white text-slate-700">{template.steps.length} 步</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-950">{template.name}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{template.summary}</p>

            <div className="mt-4 rounded-[24px] bg-slate-950 p-4 text-white">
              <div className="text-xs uppercase tracking-[0.2em] text-brand-200">适合干什么</div>
              <div className="mt-2 text-sm leading-6 text-slate-200">{template.goal}</div>
            </div>

            <div className="mt-4 space-y-3">
              {template.steps.slice(0, 4).map((step, index) => (
                <div key={step.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">{index + 1}. {step.title}</div>
                    <div className="text-xs text-slate-400">~{step.durationSec}s</div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-500">{step.description}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-600">
              <div>默认模型：<span className="font-semibold text-slate-900">{template.modelPolicy.defaultModel}</span></div>
              <div>回退模型：<span className="font-semibold text-slate-900">{template.modelPolicy.fallbackModel}</span></div>
              <div>验收方式：<span className="font-semibold text-slate-900">{template.modelPolicy.verification}</span></div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-500">
              {template.runtimeHints.map((hint) => (
                <div key={hint} className="flex gap-2 leading-6">
                  <span className="text-brand-500">•</span>
                  <span>{hint}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
