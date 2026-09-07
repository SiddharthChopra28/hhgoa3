"use client";

import * as React from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/components/ui/utils";

export const MAX_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "That file is not an image. Choose a JPEG, PNG or WebP.";
  }
  if (file.size > MAX_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  }
  return null;
}

export function Dropzone({
  onFile,
  label = "Drop a photo, or click to choose",
  hint,
  compact = false,
  className,
}: {
  onFile: (file: File) => void;
  label?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accept = React.useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const problem = validateImage(file);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      onFile(file);
    },
    [onFile],
  );

  return (
    <div className={cn("w-full", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors duration-200 ease-out",
          compact ? "gap-2 px-6 py-10" : "gap-4 px-8 py-20 sm:py-28",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-hairline-strong bg-ink-950/50 hover:border-ink-700 hover:bg-ink-950",
        )}
      >
        <ImageUp
          className={cn(
            "text-ink-600 transition-colors duration-200 ease-out group-hover:text-ink-400",
            compact ? "size-5" : "size-7",
            dragging && "text-accent",
          )}
          aria-hidden
        />
        <div className="space-y-1.5">
          <p
            className={cn(
              "font-medium text-ink-200",
              compact ? "text-sm" : "text-base",
            )}
          >
            {label}
          </p>
          <p className="text-[13px] text-ink-500">
            JPEG, PNG or WebP · up to 5 MB
          </p>
        </div>
        {hint ? (
          <p className="max-w-md text-[12px] leading-relaxed text-ink-600">
            {hint}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            accept(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
