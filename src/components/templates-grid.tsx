import type { ExecutionTemplate } from "@/features/templates/template.types";
import { domainMeta } from "@/lib/presenter";

export function TemplatesGrid({ templates }: { templates: ExecutionTemplate[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {templates.map((template) => {
        const domain = domainMeta[template.domain];
        return (
          <div key={template.id} className="section-card p-5">
            <div className="flex items-center justify-between gap-3">
              <span className={`badge ${domain.badgeClass}`}>{domain.label}</span>
              <span className="badge border-slate-200 bg-white text-slate-700">{template.steps.length} 步</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-950">{template.name}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{template.summary}</p>

            <div className="mt-4 rounded-[24px] bg-slate-950 px-4 py-4 text-sm text-slate-200">
              <div className="text-xs tracking-[0.18em] text-white/45">适用场景</div>
              <div className="mt-2 leading-6">{template.goal}</div>
            </div>

            <div className="mt-4 space-y-2">
              {template.steps.slice(0, 3).map((step, index) => (
                <div key={step.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-semibold text-slate-950">
                    {index + 1}. {step.title}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-500">
              {template.runtimeHints.slice(0, 3).map((hint) => (
                <span key={hint} className="rounded-full bg-slate-100 px-3 py-1.5">
                  {hint}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
