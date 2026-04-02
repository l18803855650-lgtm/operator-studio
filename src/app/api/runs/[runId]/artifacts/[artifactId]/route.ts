import fs from "node:fs";
import path from "node:path";
import { resolveArtifact } from "@/features/runs/run.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET(request: Request, { params }: { params: { runId: string; artifactId: string } }) {
  try {
    await requireRouteSession(request);
    const artifact = await resolveArtifact(params.runId, params.artifactId);
    const bytes = await fs.promises.readFile(artifact.filePath);
    return new Response(bytes, {
      headers: {
        "Content-Type": artifact.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename=\"${path.basename(artifact.filePath)}\"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
