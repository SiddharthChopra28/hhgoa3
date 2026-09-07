#!/usr/bin/env tsx
/**
 * CLI for the pipeline.
 *   tsx scripts/run.ts ./photo.jpg [--no-chain]
 *   tsx scripts/run.ts --check ./photo.jpg
 * Exit: 0 sealed or dry_run, 2 no_face/no_matches, 1 everything else.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { explorerBase, getChain, getContractAddress, readRecord } from "../lib/chain";
import { errorMessage } from "../lib/errors";
import { prepareImage } from "../lib/image";
import { runPipeline } from "../lib/pipeline";
import type { StageEvent, VerifyExistingResult } from "../lib/types";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function mimeOf(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "image/jpeg";
}

function short(hex: string): string {
  return hex.length > 14 ? `${hex.slice(0, 10)}…${hex.slice(-4)}` : hex;
}

function describe(event: StageEvent): string {
  if (event.stage === "done") return `[done] ${event.status} outcome=${event.result.outcome}`;
  if (event.status === "error" || event.status === "skipped") {
    return `[${event.stage}] ${event.status} ${event.message}`;
  }
  if (event.status === "start") return `[${event.stage}] start`;
  switch (event.stage) {
    case "upload":
      return `[upload] ok imageHash=${short(event.payload.imageHash)} ${event.payload.width}x${event.payload.height}`;
    case "detect":
      return `[detect] ok faceHash=${short(event.payload.faceHash)} det=${event.payload.detScore.toFixed(3)} faces=${event.payload.faceCount}`;
    case "search":
      return `[search] ok provider=${event.payload.provider} candidates=${event.payload.candidates.length}`;
    case "verify":
      return `[verify] ok matches=${event.payload.matches.length} rejected=${event.payload.rejected} threshold=${event.payload.threshold}`;
    case "record":
      return `[record] ok tx=${short(event.payload.txHash)} block=${event.payload.blockNumber}`;
  }
}

async function check(file: string): Promise<number> {
  const bytes = new Uint8Array(await readFile(file));
  const image = await prepareImage(bytes, mimeOf(file));
  const record = await readRecord(image.imageHash);
  const result: VerifyExistingResult = {
    imageHash: image.imageHash,
    found: record !== null,
    record: record ?? undefined,
    explorerContractUrl: `${explorerBase()}/address/${getContractAddress()}`,
    chainId: getChain().id,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.found ? 0 : 2;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const skipChain = argv.includes("--no-chain");
  const checkMode = argv.includes("--check");
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("usage: tsx scripts/run.ts [--no-chain] <image>  |  --check <image>\n");
    return 1;
  }

  if (checkMode) return check(file);

  const bytes = new Uint8Array(await readFile(file));
  const result = await runPipeline(
    { bytes, mime: mimeOf(file), filename: path.basename(file) },
    (event) => process.stderr.write(`${describe(event)}\n`),
    { skipChain },
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.outcome === "sealed" || result.outcome === "dry_run") return 0;
  if (result.outcome === "no_face" || result.outcome === "no_matches") return 2;
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    process.stderr.write(`fatal: ${errorMessage(e)}\n`);
    process.exitCode = 1;
  });
