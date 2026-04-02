import { createAiConnection, listAiConnections } from "@/features/ai-connections/ai-connection.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await listAiConnections());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await createAiConnection(await request.json()), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
