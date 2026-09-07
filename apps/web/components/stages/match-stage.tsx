"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import type {
  Candidate,
  SearchPayload,
  VerifiedCandidate,
  VerifyPayload,
} from "@/lib/types";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  other: "Web",
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Thumb({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <div className="flex aspect-4/3 w-full items-center justify-center bg-ink-900">
        <ImageOff className="size-4 text-ink-700" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-4/3 w-full bg-ink-900 object-cover"
    />
  );
}

function CandidateCard({
  candidate,
  similarity,
  dimmed = false,
}: {
  candidate: Candidate;
  similarity?: number;
  dimmed?: boolean;
}) {
  const title = candidate.title?.trim() || hostOf(candidate.url);
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-hairline bg-ink-950 transition-colors duration-150 ease-out hover:border-hairline-strong",
        dimmed && "opacity-55 hover:opacity-100",
      )}
    >
      <Thumb src={candidate.thumbnail} alt={`Thumbnail from ${title}`} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <Badge variant={dimmed ? "neutral" : "accent"}>
              {PLATFORM_LABEL[candidate.platform] ?? candidate.platform}
            </Badge>
            <p className="line-clamp-2 text-[13px] leading-snug text-ink-300">
              {title}
            </p>
          </div>
          {typeof similarity === "number" ? (
            <div className="shrink-0 text-right leading-none">
              <div
                className={cn(
                  "font-mono text-[28px] tabular-nums leading-none",
                  dimmed ? "text-ink-500" : "text-accent",
                )}
              >
                {Math.round(similarity * 100)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-600">
                match
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="truncate font-mono text-[11px] text-ink-600">
            {hostOf(candidate.url)}
          </span>
          <a
            href={candidate.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-500 transition-colors duration-150 ease-out hover:bg-ink-850 hover:text-ink-100"
            aria-label={`Open ${title} in a new tab`}
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

export function MatchStage({
  search,
  verify,
}: {
  search?: SearchPayload;
  verify?: VerifyPayload;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = React.useState(false);

  const candidates = search?.candidates ?? [];
  const matches: VerifiedCandidate[] = verify?.matches ?? [];
  const matchedUrls = new Set(matches.map((m) => m.url));
  const scoreOf = new Map((verify?.scored ?? []).map((c) => [c.url, c.similarity]));
  const others = candidates.filter((c) => !matchedUrls.has(c.url));

  if (candidates.length === 0 && verify) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-400">
        No public posts found for this photo.
      </p>
    );
  }

  if (verify && matches.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-400">
          Nothing to seal: search results did not contain this face.
        </p>
        {others.length > 0 ? (
          <OtherCandidates
            others={others}
            open={open}
            setOpen={setOpen}
            reduced={!!reduced}
            scoreOf={scoreOf}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {verify ? (
        <p className="text-[12px] text-ink-600">
          {matches.length} of {candidates.length} candidates verified at threshold{" "}
          <span className="tabular-nums">{verify.threshold.toFixed(2)}</span>
          {search ? ` · via ${search.provider === "tineye" ? "TinEye" : "Google Lens"}` : ""}
        </p>
      ) : (
        <p className="text-[12px] text-ink-600">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"} found
          {search ? ` via ${search.provider === "tineye" ? "TinEye" : "Google Lens"}` : ""} — verifying…
        </p>
      )}

      {matches.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {matches.map((match) => (
            <CandidateCard
              key={match.url}
              candidate={match}
              similarity={match.similarity}
            />
          ))}
        </div>
      ) : null}

      {verify && others.length > 0 ? (
        <OtherCandidates
          others={others}
          open={open}
          setOpen={setOpen}
          reduced={!!reduced}
          scoreOf={scoreOf}
        />
      ) : null}
    </div>
  );
}

function OtherCandidates({
  others,
  open,
  setOpen,
  reduced,
  scoreOf,
}: {
  others: Candidate[];
  open: boolean;
  setOpen: (v: boolean) => void;
  reduced: boolean;
  scoreOf: Map<string, number>;
}) {
  return (
    <div className="rounded-lg border border-hairline">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] text-ink-500 transition-colors duration-150 ease-out hover:text-ink-200"
      >
        <span>
          {others.length} candidate{others.length === 1 ? "" : "s"} did not match
        </span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-200 ease-out",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="others"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-3 border-t border-hairline p-4 sm:grid-cols-2">
              {others.map((candidate) => (
                <CandidateCard
                  key={candidate.url}
                  candidate={candidate}
                  similarity={scoreOf.get(candidate.url)}
                  dimmed
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
