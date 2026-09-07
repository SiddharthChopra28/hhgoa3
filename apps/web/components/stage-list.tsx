"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, LoaderCircle, Minus, X } from "lucide-react";
import { FaceStage } from "@/components/stages/face-stage";
import { MatchStage } from "@/components/stages/match-stage";
import { ChainStage } from "@/components/stages/chain-stage";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { cn, formatDuration, truncateHash } from "@/components/ui/utils";
import type { PipelineState, StageUiStatus, StageView } from "@/hooks/use-pipeline";
import type { Stage } from "@/lib/types";

const TITLES: Record<Stage, string> = {
  upload: "Normalise and hash",
  detect: "Detect and encode the face",
  search: "Reverse image search",
  verify: "Verify the face in each result",
  record: "Seal on chain",
};

function StatusGlyph({ status }: { status: StageUiStatus }) {
  const base = "flex size-5 shrink-0 items-center justify-center rounded-full border";
  if (status === "running") {
    return (
      <span className={cn(base, "border-accent-line text-accent")} aria-hidden>
        <LoaderCircle className="size-3 spin-slow" />
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className={cn(base, "border-transparent bg-accent text-ink-1000")} aria-hidden>
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={cn(base, "border-danger/50 text-danger")} aria-hidden>
        <X className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className={cn(base, "border-hairline text-ink-600")} aria-hidden>
        <Minus className="size-3" />
      </span>
    );
  }
  return <span className={cn(base, "border-hairline")} aria-hidden />;
}

function detailFor(view: StageView, state: PipelineState): string | null {
  if (view.message) return view.message;
  switch (view.stage) {
    case "upload":
      return state.upload
        ? `Resized to ${state.upload.width} × ${state.upload.height}, hashed`
        : view.status === "running"
          ? "Resizing to 1024 px…"
          : null;
    case "detect":
      return state.detect
        ? `1 face used · det ${state.detect.detScore.toFixed(2)}`
        : view.status === "running"
          ? "Looking for a face…"
          : null;
    case "search":
      return state.search
        ? `${state.search.candidates.length} candidate${state.search.candidates.length === 1 ? "" : "s"} from ${state.search.provider === "tineye" ? "TinEye" : "Google Lens"}`
        : view.status === "running"
          ? "Searching public posts…"
          : null;
    case "verify":
      return state.verify
        ? `${state.verify.matches.length} verified · ${state.verify.rejected} rejected`
        : view.status === "running"
          ? "Comparing faces…"
          : null;
    case "record":
      return state.receipt
        ? "Record written"
        : view.status === "running"
          ? "Submitting transaction…"
          : null;
    default:
      return null;
  }
}

export function StageList({
  state,
  file,
  sealing,
  onRetrySeal,
}: {
  state: PipelineState;
  file: File;
  sealing: boolean;
  onRetrySeal: () => void;
}) {
  const reduced = useReducedMotion();
  const visible = state.stages.filter((s) => s.status !== "idle");

  const anim = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
        transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
      };

  const canRetry = Boolean(
    (state.result?.imageHash ?? state.upload?.imageHash) &&
      (state.result?.faceHash ?? state.detect?.faceHash) &&
      (state.result?.best?.url ?? state.verify?.matches[0]?.url),
  );

  return (
    <ol className="space-y-0" aria-live="polite" aria-label="Pipeline progress">
      <AnimatePresence initial={false}>
        {visible.map((view) => {
          const detail = detailFor(view, state);
          const elapsed =
            view.startedAt && view.endedAt ? view.endedAt - view.startedAt : null;

          return (
            <motion.li
              key={view.stage}
              layout={!reduced}
              {...anim}
              className="border-b border-hairline py-5 last:border-b-0"
            >
              <div className="flex items-start gap-3">
                <StatusGlyph status={view.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      className={cn(
                        "text-sm font-medium",
                        view.status === "idle" ? "text-ink-600" : "text-ink-100",
                      )}
                    >
                      {TITLES[view.stage]}
                    </h3>
                    {elapsed !== null ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-600">
                        {formatDuration(elapsed)}
                      </span>
                    ) : null}
                  </div>
                  {detail ? (
                    <p
                      className={cn(
                        "mt-1 text-[13px] leading-relaxed",
                        view.status === "error" ? "text-danger" : "text-ink-500",
                      )}
                    >
                      {detail}
                    </p>
                  ) : null}

                  <StageBody
                    view={view}
                    state={state}
                    file={file}
                    sealing={sealing}
                    canRetry={canRetry}
                    onRetrySeal={onRetrySeal}
                  />
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

function StageBody({
  view,
  state,
  file,
  sealing,
  canRetry,
  onRetrySeal,
}: {
  view: StageView;
  state: PipelineState;
  file: File;
  sealing: boolean;
  canRetry: boolean;
  onRetrySeal: () => void;
}) {
  if (view.stage === "upload" && state.upload) {
    return (
      <div className="mt-3 flex items-center gap-1.5">
        <code className="min-w-0 truncate rounded bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-400">
          {truncateHash(state.upload.imageHash)}
        </code>
        <CopyButton value={state.upload.imageHash} label="image hash" />
      </div>
    );
  }

  if (view.stage === "detect") {
    if (view.status === "ok" && state.detect) {
      return (
        <div className="mt-4">
          <FaceStage
            file={file}
            detect={state.detect}
            sourceWidth={state.upload?.width}
            sourceHeight={state.upload?.height}
          />
        </div>
      );
    }
    if (state.result?.outcome === "no_face" || view.status === "error") {
      return null;
    }
    return null;
  }

  if (view.stage === "verify" && (state.verify || state.search)) {
    return (
      <div className="mt-4">
        <MatchStage search={state.search} verify={state.verify} />
      </div>
    );
  }

  if (view.stage === "record") {
    if (state.receipt) {
      return (
        <div className="mt-4">
          <ChainStage receipt={state.receipt} />
        </div>
      );
    }
    if (view.status === "error") {
      return (
        <div className="mt-4">
          <ChainStage
            error={view.message}
            canRetry={canRetry}
            retrying={sealing}
            onRetry={onRetrySeal}
          />
        </div>
      );
    }
  }

  return null;
}

export function NoFaceState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-lg border border-hairline bg-ink-950/70 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-100">No face found in this photo</p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-500">
        Provenance needs a face to verify search results against. Try a photo where a
        face is clearly visible.
      </p>
      <Button className="mt-5" size="sm" onClick={onReset}>
        Try another photo
      </Button>
    </div>
  );
}
