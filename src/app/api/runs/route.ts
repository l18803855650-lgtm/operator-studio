import { createRun, listRuns } from "@/features/runs/run.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await listRuns());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRouteSession(request);
    const body = await request.json();
    return jsonOk(await createRun(body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
