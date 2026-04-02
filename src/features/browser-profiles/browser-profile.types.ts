export interface BrowserTotpConfig {
  secret: string;
  issuer?: string | null;
  accountName?: string | null;
  digits?: number | null;
  period?: number | null;
  algorithm?: string | null;
}

export interface BrowserProfileRecord {
  id: string;
  name: string;
  description?: string | null;
  storageStatePath?: string | null;
  headers?: Record<string, string> | null;
  cookies?: Record<string, unknown>[] | null;
  basicAuth?: { username: string; password: string } | null;
  locale?: string | null;
  userAgent?: string | null;
  secrets?: Record<string, string> | null;
  totp?: BrowserTotpConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrowserProfileInput {
  name: string;
  description?: string;
  storageStatePath?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, unknown>[];
  basicAuth?: { username: string; password: string };
  locale?: string;
  userAgent?: string;
  secrets?: Record<string, string>;
  totp?: BrowserTotpConfig;
}
