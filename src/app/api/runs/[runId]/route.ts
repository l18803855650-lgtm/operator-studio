import { getRun, updateRunDesiredState } from "@/features/runs/run.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request, { params }: { params: { runId: string } }) {
  try {
    await requireRouteSession(request);
    return jsonOk(await getRun(params.runId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { runId: string } }) {
  try {
    await requireRouteSession(request);
    const body = await request.json();
    return jsonOk(await updateRunDesiredState(params.runId, body.desiredState));
  } catch (error) {
    return jsonError(error);
  }
}
