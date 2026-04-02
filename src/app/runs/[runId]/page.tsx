import { notFound } from "next/navigation";
import { getRunDetail } from "@/features/runs/run.service";
import { LiveRunPanel } from "@/components/live-run-panel";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: { runId: string } }) {
  await requirePageSession();
  try {
    const run = await getRunDetail(params.runId);
    return (
      <main className="page-shell">
        <LiveRunPanel initialRun={run} />
      </main>
    );
  } catch {
    notFound();
  }
}
