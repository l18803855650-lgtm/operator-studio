export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", scope: "operator-studio", message, ...meta }));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: "warn", scope: "operator-studio", message, ...meta }));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: "error", scope: "operator-studio", message, ...meta }));
  },
};
