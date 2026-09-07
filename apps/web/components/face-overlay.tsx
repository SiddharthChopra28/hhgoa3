"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { FaceBox } from "@/lib/types";

/**
 * Draws animated corner brackets around the detected face.
 *
 * `box` is expressed in the coordinate space of the RESIZED image
 * (`sourceWidth` x `sourceHeight`, from the `upload ok` payload); the overlay
 * scales it into the rendered `<img>` box (`width` x `height`).
 */
export function FaceOverlay({
  box,
  sourceWidth,
  sourceHeight,
  width,
  height,
}: {
  box: FaceBox;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
}) {
  const reduced = useReducedMotion();
  if (!sourceWidth || !sourceHeight || !width || !height) return null;

  const sx = width / sourceWidth;
  const sy = height / sourceHeight;
  const x = box.x * sx;
  const y = box.y * sy;
  const w = box.width * sx;
  const h = box.height * sy;
  const arm = Math.max(8, Math.min(w, h) * 0.24);

  const corners = [
    `M ${x} ${y + arm} L ${x} ${y} L ${x + arm} ${y}`,
    `M ${x + w - arm} ${y} L ${x + w} ${y} L ${x + w} ${y + arm}`,
    `M ${x + w} ${y + h - arm} L ${x + w} ${y + h} L ${x + w - arm} ${y + h}`,
    `M ${x + arm} ${y + h} L ${x} ${y + h} L ${x} ${y + h - arm}`,
  ];

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
    >
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill="transparent"
        stroke="var(--color-accent)"
        strokeOpacity={0.28}
        strokeWidth={1}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      />
      {corners.map((d, index) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: reduced ? 0 : 0.28,
            delay: reduced ? 0 : 0.06 * index,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </svg>
  );
}
