"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaceOverlay } from "@/components/face-overlay";
import type { FaceBox } from "@/lib/types";

export function PhotoPanel({
  file,
  box,
  sourceWidth,
  sourceHeight,
  running,
  hasRun,
  onRun,
  onReset,
}: {
  file: File;
  box?: FaceBox;
  sourceWidth?: number;
  sourceHeight?: number;
  running: boolean;
  hasRun: boolean;
  onRun: () => void;
  onReset: () => void;
}) {
  // Create and revoke inside one effect so StrictMode's double-invoke cannot revoke a live URL.
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const next = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL must be created and revoked in the same effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const imgRef = React.useRef<HTMLImageElement>(null);
  const [rendered, setRendered] = React.useState({ width: 0, height: 0 });
  const [natural, setNatural] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const el = imgRef.current;
    if (!el || !url || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setRendered({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  function handleLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const el = event.currentTarget;
    setRendered({ width: el.clientWidth, height: el.clientHeight });
    setNatural({ width: el.naturalWidth, height: el.naturalHeight });
  }

  // Fall back to the file's natural ratio if the resized dims never arrived.
  const srcW = sourceWidth || natural.width;
  const srcH = sourceHeight || natural.height;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-hairline bg-ink-950">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
          ref={imgRef}
          src={url}
          alt="The photo you uploaded. Once detection completes the found face is outlined."
          onLoad={handleLoad}
          className="block h-auto w-full select-none"
        />
        ) : null}
        {box && srcW > 0 && srcH > 0 && rendered.width > 0 ? (
          <FaceOverlay
            box={box}
            sourceWidth={srcW}
            sourceHeight={srcH}
            width={rendered.width}
            height={rendered.height}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={onRun}
          disabled={running || hasRun}
          className="flex-1"
        >
          {running ? "Running…" : hasRun ? "Run complete" : "Run"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label="Start over"
        >
          <RotateCcw aria-hidden />
        </Button>
      </div>

      <dl className="space-y-1 text-[12px] text-ink-600">
        <div className="flex justify-between gap-4">
          <dt className="truncate">{file.name}</dt>
          <dd className="shrink-0 tabular-nums">
            {(file.size / 1024).toFixed(0)} KB
          </dd>
        </div>
        {sourceWidth && sourceHeight ? (
          <div className="flex justify-between gap-4">
            <dt>Normalised</dt>
            <dd className="tabular-nums">
              {sourceWidth} × {sourceHeight}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
