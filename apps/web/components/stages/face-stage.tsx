"use client";

import * as React from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { truncateHash } from "@/components/ui/utils";
import type { DetectPayload } from "@/lib/types";

const CROP_PX = 96;

/**
 * Crops the detected face out of the ORIGINAL file. `box` is in the resized
 * image's coordinate space, so it is scaled by (natural / resized).
 */
export function FaceStage({
  file,
  detect,
  sourceWidth,
  sourceHeight,
}: {
  file: File;
  detect: DetectPayload;
  sourceWidth?: number;
  sourceHeight?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { box } = detect;

  React.useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;

    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas || typeof createImageBitmap !== "function") return;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        return;
      }
      if (cancelled || !bitmap) return;

      const sx = bitmap.width / (sourceWidth || bitmap.width);
      const sy = bitmap.height / (sourceHeight || bitmap.height);
      const pad = 0.22;
      let cx = box.x * sx - box.width * sx * pad;
      let cy = box.y * sy - box.height * sy * pad;
      let cw = box.width * sx * (1 + pad * 2);
      let ch = box.height * sy * (1 + pad * 2);
      cx = Math.max(0, Math.min(cx, bitmap.width - 1));
      cy = Math.max(0, Math.min(cy, bitmap.height - 1));
      cw = Math.max(1, Math.min(cw, bitmap.width - cx));
      ch = Math.max(1, Math.min(ch, bitmap.height - cy));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = CROP_PX * dpr;
      canvas.height = CROP_PX * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      bitmap = null;
    }

    void draw();
    return () => {
      cancelled = true;
      bitmap?.close?.();
    };
  }, [file, box, sourceWidth, sourceHeight]);

  return (
    <div className="flex items-start gap-4">
      <canvas
        ref={canvasRef}
        width={CROP_PX}
        height={CROP_PX}
        role="img"
        aria-label="Crop of the detected face"
        className="size-24 shrink-0 rounded-md border border-hairline bg-ink-900"
        style={{ width: CROP_PX, height: CROP_PX }}
      />
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-ink-200">Face encoded</span>
          <span className="text-[12px] tabular-nums text-ink-500">
            det {detect.detScore.toFixed(3)}
          </span>
          {detect.faceCount > 1 ? (
            <span className="text-[12px] text-ink-600">
              {detect.faceCount} faces found — largest used
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 truncate rounded bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-400">
            {truncateHash(detect.faceHash)}
          </code>
          <CopyButton value={detect.faceHash} label="face hash" />
        </div>
        <p className="text-[12px] leading-relaxed text-ink-600">
          The embedding stays on the server for this run. Only its hash is kept.
        </p>
      </div>
    </div>
  );
}
