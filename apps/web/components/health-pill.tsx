"use client";

import * as React from "react";
import { cn } from "@/components/ui/utils";

const CHAIN_LABEL: Record<string, string> = {
  "arbitrum-one": "Arbitrum One",
  "arbitrum-sepolia": "Arbitrum Sepolia",
  "ethereum-sepolia": "Ethereum Sepolia",
};

interface Health {
  ok: boolean;
  faceService: boolean;
  chain: string;
  contract: string | null;
}

export function HealthPill() {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => (res.ok ? (res.json() as Promise<Health>) : Promise.reject()))
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dot = (ok: boolean) => (
    <span
      className={cn(
        "size-1.5 rounded-full",
        ok ? "bg-ok" : "bg-danger",
      )}
      aria-hidden
    />
  );

  if (failed) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[11px] text-ink-500">
        {dot(false)} Status unavailable
      </div>
    );
  }

  if (!health) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[11px] text-ink-600">
        <span className="size-1.5 rounded-full bg-ink-700" aria-hidden />
        Checking…
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-hairline px-3 py-1 text-[11px] text-ink-400">
      <span className="inline-flex items-center gap-1.5">
        {dot(health.faceService)}
        {health.faceService ? "Face service up" : "Face service down"}
      </span>
      <span className="h-3 w-px bg-hairline" aria-hidden />
      <span className="text-ink-500">{CHAIN_LABEL[health.chain] ?? health.chain}</span>
    </div>
  );
}
