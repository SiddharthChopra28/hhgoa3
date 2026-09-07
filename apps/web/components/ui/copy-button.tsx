"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/components/ui/utils";

export function CopyButton({
  value,
  label = "value",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable (insecure context) — stay silent */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors duration-150 ease-out hover:bg-ink-850 hover:text-ink-100",
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-ok" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}
