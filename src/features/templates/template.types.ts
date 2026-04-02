export type TemplateDomain = "browser" | "media" | "manufacturing";

export interface TemplateStep {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  toolHint: string;
  evidenceHint: string;
}

export interface ExecutionTemplate {
  id: string;
  name: string;
  summary: string;
  domain: TemplateDomain;
  goal: string;
  modelPolicy: {
    defaultModel: string;
    fallbackModel: string;
    verification: string;
  };
  runtimeHints: string[];
  steps: TemplateStep[];
}
