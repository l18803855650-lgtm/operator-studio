import path from "node:path";

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  appBaseUrl: requiredEnv("APP_BASE_URL", "http://127.0.0.1:3010"),
  dataDir: path.resolve(process.cwd(), requiredEnv("OPERATOR_DATA_DIR", "./data")),
  dbPath: path.resolve(
    process.cwd(),
    process.env.OPERATOR_DB_PATH ?? path.join(requiredEnv("OPERATOR_DATA_DIR", "./data"), "operator-studio.sqlite"),
  ),
} as const;
