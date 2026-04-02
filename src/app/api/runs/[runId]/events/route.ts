import { getRunEvents } from "@/features/runs/run.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request, { params }: { params: { runId: string } }) {
  try {
    await requireRouteSession(request);
    return jsonOk(await getRunEvents(params.runId));
  } catch (error) {
    return jsonError(error);
  }
}
