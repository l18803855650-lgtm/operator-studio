import { promises as fs } from "node:fs";
import path from "node:path";

export async function ensureJsonFile<T>(filePath: string, initialData: T) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(initialData, null, 2), "utf8");
  }
}

export async function readJsonFile<T>(filePath: string, initialData: T): Promise<T> {
  await ensureJsonFile(filePath, initialData);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile<T>(filePath: string, data: T) {
  await ensureJsonFile(filePath, data);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
