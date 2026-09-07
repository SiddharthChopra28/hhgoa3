import type { PipelineInput, PipelineOptions } from "./pipeline";
import { runPipeline } from "./pipeline";
import type { StageEvent } from "./types";

const KEEPALIVE_MS = 15_000;

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/** Stream a pipeline run as `data: <json>` frames, with a comment ping every 15 s. */
export function pipelineStream(
  input: PipelineInput,
  options?: PipelineOptions,
  onDone?: () => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (keepalive) clearInterval(keepalive);
    onDone?.();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const emit = (event: StageEvent) => send(`data: ${JSON.stringify(event)}\n\n`);

      keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
      try {
        await runPipeline(input, emit, options);
      } catch (e) {
        emit({ stage: "done", status: "error", result: { jobId: "", outcome: "error", candidates: [], matches: [], error: e instanceof Error ? e.message : String(e) } });
      } finally {
        finish();
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      }
    },
    cancel() {
      finish();
    },
  });
}
