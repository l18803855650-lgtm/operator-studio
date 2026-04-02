import { getRunArtifacts, uploadRunArtifact } from "@/features/runs/run.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request, { params }: { params: { runId: string } }) {
  try {
    await requireRouteSession(request);
    return jsonOk(await getRunArtifacts(params.runId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: { runId: string } }) {
  try {
    await requireRouteSession(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("file is required");
    }
    const label = String(form.get("label") ?? file.name);
    const kind = String(form.get("kind") ?? "upload") as "upload" | "evidence" | "log" | "replay" | "output";
    const bytes = Buffer.from(await file.arrayBuffer());

    const artifact = await uploadRunArtifact({
      runId: params.runId,
      kind,
      label,
      fileName: file.name,
      contentType: file.type || undefined,
      bytes,
      metadata: {
        size: file.size,
      },
    });
    return jsonOk(artifact, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
