export interface AiConnectionRecord {
  id: string;
  name: string;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKeyPreview: string | null;
  notes?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiConnectionSecretRecord extends AiConnectionRecord {
  apiKey: string;
}

export interface CreateAiConnectionInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  notes?: string;
  enabled?: boolean;
}
