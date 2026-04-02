export const dynamic = "force-dynamic";

import { listTemplates } from "@/features/templates/template.repository";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await listTemplates());
  } catch (error) {
    return jsonError(error);
  }
}
