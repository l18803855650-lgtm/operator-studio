import { getRun } from "@/features/runs/run.service";
import { requireRouteSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { runId: string } }) {
  await requireRouteSession(request);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = async () => {
        if (closed) return;
        try {
          const run = await getRun(params.runId);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ data: run })}\n\n`));
          if (run.status === "completed" || run.status === "stopped") {
            closed = true;
            controller.close();
            return;
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
          closed = true;
          controller.close();
        }
      };

      await send();
      const interval = setInterval(send, 1500);
      const timeout = setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(interval);
          controller.close();
        }
      }, 45_000);

      const cleanup = () => {
        clearInterval(interval);
        clearTimeout(timeout);
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      // @ts-expect-error Next runtime may call cancel on underlying stream
      controller.cleanup = cleanup;
    },
    cancel() {
      // no-op
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
