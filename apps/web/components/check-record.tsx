"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Dropzone } from "@/components/dropzone";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { chainName, cn, truncateHash } from "@/components/ui/utils";
import type { VerifyExistingResult } from "@/lib/types";

function Row({
  label,
  value,
  href,
  copyValue,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  copyValue?: string;
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

export function CheckRecord() {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<VerifyExistingResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function check() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/verify-existing", { method: "POST", body });
      const data = (await res.json()) as VerifyExistingResult | { error?: string };
      if (!res.ok || "error" in data) {
        setError(
          ("error" in data && data.error) || `Lookup failed (${res.status})`,
        );
        return;
      }
      setResult(data as VerifyExistingResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-ink-100">Check a record</h2>
        <p className="text-[13px] leading-relaxed text-ink-500">
          Look up whether a photo has already been sealed. The image hash is computed
          after the same 1024 px normalisation used when sealing, so the same photo
          always produces the same hash.
        </p>
      </div>

      {file ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-ink-950/70 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-300">
            {file.name}
          </span>
          <span className="text-[12px] tabular-nums text-ink-600">
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <Button size="sm" variant="primary" onClick={check} disabled={busy}>
            {busy ? "Checking…" : "Check"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Clear
          </Button>
        </div>
      ) : (
        <Dropzone compact onFile={setFile} label="Drop the photo to look up" />
      )}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger"
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="rounded-md border border-dashed border-hairline-strong bg-ink-1000/60 px-4 py-2">
            <div className="divide-y divide-[color:var(--color-hairline)]">
              <Row
                label="Image hash"
                value={truncateHash(result.imageHash)}
                copyValue={result.imageHash}
              />
              <Row
                label="Network"
                value={chainName(result.chainId)}
                mono={false}
              />
              <Row
                label="Contract"
                value="View on explorer"
                href={result.explorerContractUrl}
                mono={false}
              />
              {result.found && result.record ? (
                <>
                  <Row
                    label="Post"
                    value={result.record.postUrl}
                    href={result.record.postUrl}
                    copyValue={result.record.postUrl}
                    mono={false}
                  />
                  <Row
                    label="Face hash"
                    value={truncateHash(result.record.faceHash)}
                    copyValue={result.record.faceHash}
                  />
                  <Row
                    label="Sealed"
                    value={new Date(result.record.timestamp * 1000).toLocaleString()}
                    mono={false}
                  />
                  <Row
                    label="Submitter"
                    value={truncateHash(result.record.submitter)}
                    copyValue={result.record.submitter}
                  />
                </>
              ) : null}
            </div>
          </div>
          {!result.found ? (
            <p className="text-[13px] text-ink-400">
              No record for this image hash.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
