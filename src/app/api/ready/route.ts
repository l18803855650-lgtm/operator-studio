import { jsonError, jsonOk } from "@/lib/http";
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
      status: governance.worker.status === "healthy" ? "ready" : "degraded",
      checks: {
        database: {
          status: "ok",
          ...database,
        },
        worker: governance.worker,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
