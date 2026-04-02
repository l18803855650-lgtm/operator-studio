import { config } from "@/lib/config";
import { jsonOk, jsonError } from "@/lib/http";
import { getDbMeta } from "@/lib/sqlite";
import { getGovernanceStatus } from "@/features/governance/governance.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [database, governance] = await Promise.all([
      getDbMeta(),
      getGovernanceStatus(),
    ]);
    return jsonOk({
      status: "ok",
      service: "operator-studio",
      appBaseUrl: config.appBaseUrl,
      dataDir: config.dataDir,
      database,
      worker: governance.worker,
    });
  } catch (error) {
    return jsonError(error);
  }
}
