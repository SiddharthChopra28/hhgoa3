"use client";

import * as React from "react";
import type {
  ChainReceipt,
  DetectPayload,
  PipelineResult,
  SearchPayload,
  Stage,
  StageEvent,
  UploadPayload,
  VerifyPayload,
} from "@/lib/types";

export const STAGES: Stage[] = ["upload", "detect", "search", "verify", "record"];

export type StageUiStatus = "idle" | "running" | "ok" | "error" | "skipped";

export interface StageView {
  stage: Stage;
  status: StageUiStatus;
  message?: string;
  startedAt?: number;
  endedAt?: number;
}

export type RunStatus = "idle" | "running" | "done";

export interface PipelineState {
  status: RunStatus;
  stages: StageView[];
  upload?: UploadPayload;
  detect?: DetectPayload;
  search?: SearchPayload;
  verify?: VerifyPayload;
  receipt?: ChainReceipt;
  result?: PipelineResult;
  /** Transport / parse failure — surfaced as a banner, not a stage. */
  transportError?: string;
}

const initialStages = (): StageView[] =>
  STAGES.map((stage) => ({ stage, status: "idle" as StageUiStatus }));

const initialState = (): PipelineState => ({
  status: "idle",
  stages: initialStages(),
});

function patchStage(
  stages: StageView[],
  stage: Stage,
  patch: Partial<StageView>,
): StageView[] {
  return stages.map((s) => (s.stage === stage ? { ...s, ...patch } : s));
}

/** SSE frame boundary: a blank line, in any of the three line-ending forms. */
const FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/;

/**
 * Parses one SSE frame (the text between two blank lines) and returns the
 * decoded events. Comment lines (`: keepalive`) and non-`data:` fields are
 * ignored; malformed JSON is dropped rather than thrown.
 */
export function parseFrame(frame: string): StageEvent[] {
  const out: StageEvent[] = [];
  const dataLines: string[] = [];
  for (const line of frame.split(/\r\n|\n|\r/)) {
    if (line === "" || line.startsWith(":")) continue;
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return out;
  const payload = dataLines.join("\n");
  if (payload === "" || payload === "[DONE]") return out;
  try {
    out.push(JSON.parse(payload) as StageEvent);
  } catch {
    /* ignore malformed frame */
  }
  return out;
}

export function usePipeline() {
  const [state, setState] = React.useState<PipelineState>(initialState);
  const [events, setEvents] = React.useState<StageEvent[]>([]);
  const [sealing, setSealing] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const applyEvent = React.useCallback((event: StageEvent) => {
    const now = Date.now();
    setEvents((prev) => [...prev, event]);
    setState((prev) => {
      if (event.stage === "done") {
        const result = event.result;
        // Any stage left running at `done` is no longer running.
        const stages = prev.stages.map((s) =>
          s.status === "running"
            ? { ...s, status: "skipped" as StageUiStatus, endedAt: now }
            : s,
        );
        return {
          ...prev,
          stages,
          status: "done",
          result,
          receipt: result.receipt ?? prev.receipt,
        };
      }

      const stage = event.stage;
      switch (event.status) {
        case "start":
          return {
            ...prev,
            status: "running",
            stages: patchStage(prev.stages, stage, {
              status: "running",
              startedAt: now,
              endedAt: undefined,
              message: undefined,
            }),
          };
        case "error":
          return {
            ...prev,
            stages: patchStage(prev.stages, stage, {
              status: "error",
              endedAt: now,
              message: event.message,
            }),
          };
        case "skipped":
          return {
            ...prev,
            stages: patchStage(prev.stages, stage, {
              status: "skipped",
              endedAt: now,
              message: event.message,
            }),
          };
        case "ok": {
          const next: PipelineState = {
            ...prev,
            stages: patchStage(prev.stages, stage, {
              status: "ok",
              endedAt: now,
            }),
          };
          switch (event.stage) {
            case "upload":
              next.upload = event.payload;
              break;
            case "detect":
              next.detect = event.payload;
              break;
            case "search":
              next.search = event.payload;
              break;
            case "verify":
              next.verify = event.payload;
              break;
            case "record":
              next.receipt = event.payload;
              break;
          }
          return next;
        }
        default:
          return prev;
      }
    });
  }, []);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState());
    setEvents([]);
    setSealing(false);
  }, []);

  const run = React.useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setEvents([]);
      setSealing(false);
      setState({ ...initialState(), status: "running" });

      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/run", {
          method: "POST",
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const text = await res.text();
            if (text) {
              try {
                const parsed = JSON.parse(text) as { error?: string };
                message = parsed.error ?? text.slice(0, 200);
              } catch {
                message = text.slice(0, 200);
              }
            }
          } catch {
            /* ignore */
          }
          setState((prev) => ({
            ...prev,
            status: "done",
            transportError: message,
          }));
          return;
        }

        if (!res.body) {
          setState((prev) => ({
            ...prev,
            status: "done",
            transportError: "The server returned an empty stream.",
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const drain = () => {
          for (;;) {
            const match = FRAME_SEPARATOR.exec(buffer);
            if (!match) break;
            const frame = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            for (const event of parseFrame(frame)) applyEvent(event);
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          drain();
        }
        buffer += decoder.decode();
        drain();
        // Trailing frame without a terminating blank line.
        for (const event of parseFrame(buffer)) applyEvent(event);
        buffer = "";

        setState((prev) =>
          prev.status === "running" ? { ...prev, status: "done" } : prev,
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          status: "done",
          transportError:
            error instanceof Error ? error.message : "Network error.",
        }));
      }
    },
    [applyEvent],
  );

  const retrySeal = React.useCallback(async () => {
    const result = state.result;
    const imageHash = result?.imageHash ?? state.upload?.imageHash;
    const faceHash = result?.faceHash ?? state.detect?.faceHash;
    const postUrl = result?.best?.url ?? state.verify?.matches[0]?.url;
    if (!imageHash || !faceHash || !postUrl) return;

    setSealing(true);
    setState((prev) => ({
      ...prev,
      stages: patchStage(prev.stages, "record", {
        status: "running",
        startedAt: Date.now(),
        endedAt: undefined,
        message: undefined,
      }),
    }));

    try {
      const res = await fetch("/api/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageHash, faceHash, postUrl }),
      });
      const data = (await res.json()) as ChainReceipt | { error?: string };
      if (!res.ok || "error" in data) {
        const message =
          ("error" in data && data.error) || `Seal failed (${res.status})`;
        setState((prev) => ({
          ...prev,
          stages: patchStage(prev.stages, "record", {
            status: "error",
            endedAt: Date.now(),
            message,
          }),
        }));
        return;
      }
      const receipt = data as ChainReceipt;
      setState((prev) => ({
        ...prev,
        receipt,
        result: prev.result
          ? { ...prev.result, receipt, outcome: "sealed" }
          : prev.result,
        stages: patchStage(prev.stages, "record", {
          status: "ok",
          endedAt: Date.now(),
          message: undefined,
        }),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stages: patchStage(prev.stages, "record", {
          status: "error",
          endedAt: Date.now(),
          message:
            error instanceof Error ? error.message : "Network error while sealing.",
        }),
      }));
    } finally {
      setSealing(false);
    }
  }, [state.result, state.upload, state.detect, state.verify]);

  return { state, events, result: state.result, sealing, run, reset, retrySeal };
}
