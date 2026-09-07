"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { chainName, cn, formatEth, truncateHash } from "@/components/ui/utils";
import type { ChainReceipt } from "@/lib/types";

function Row({
  label,
  value,
  copyValue,
  href,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-ink-600">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 truncate text-[13px] text-ink-200 underline-offset-4 hover:text-accent hover:underline",
              mono && "font-mono",
            )}
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
          </a>
        ) : (
          <span
            className={cn(
              "truncate text-[13px] text-ink-200",
              mono && "font-mono tabular-nums",
            )}
          >
            {value}
          </span>
        )}
        {copyValue ? <CopyButton value={copyValue} label={label} /> : null}
      </span>
    </div>
  );
}

export function ChainStage({
  receipt,
  error,
  canRetry,
  retrying,
  onRetry,
}: {
  receipt?: ChainReceipt;
  error?: string;
  canRetry?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  if (!receipt) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-danger">
          {error ?? "The record was not written."}
        </p>
        {canRetry && onRetry ? (
          <Button size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? "Sealing…" : "Retry seal"}
          </Button>
        ) : null}
      </div>
    );
  }

  const eth = receipt.gasCostWei ? formatEth(receipt.gasCostWei) : null;

  return (
    <div className="rounded-md border border-dashed border-hairline-strong bg-ink-1000/60 px-4 py-2">
      <div className="divide-y divide-[color:var(--color-hairline)]">
        <Row label="Network" value={chainName(receipt.chainId)} mono={false} />
        <Row
          label="Contract"
          value={truncateHash(receipt.contractAddress)}
          href={receipt.explorerContractUrl}
          copyValue={receipt.contractAddress}
        />
        <Row
          label="Tx hash"
          value={truncateHash(receipt.txHash)}
          href={receipt.explorerTxUrl}
          copyValue={receipt.txHash}
        />
        <Row
          label="Block"
          value={receipt.blockNumber}
          copyValue={receipt.blockNumber}
        />
        {eth ? <Row label="Cost" value={`${eth} ETH`} /> : null}
      </div>
    </div>
  );
}
