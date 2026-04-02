import { getGovernanceStatus, updateGovernanceSettings } from "@/features/governance/governance.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await getGovernanceStatus());
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRouteSession(request);
    const body = await request.json();
    return jsonOk(await updateGovernanceSettings(body));
  } catch (error) {
    return jsonError(error);
  }
}
