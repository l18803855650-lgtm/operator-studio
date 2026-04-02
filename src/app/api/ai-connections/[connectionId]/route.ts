import { deleteAiConnection } from "@/features/ai-connections/ai-connection.service";
import { requireRouteSession } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: { connectionId: string } }) {
  try {
    await requireRouteSession(request);
    if (!params.connectionId) throw new ValidationError("缺少 connectionId");
    await deleteAiConnection(params.connectionId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
