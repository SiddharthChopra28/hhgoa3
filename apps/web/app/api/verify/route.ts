import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { AppError, errorMessage } from "@/lib/errors";
import { compare } from "@/lib/face";
import { jsonError, readJson } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import type { VerifiedCandidate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const platform = z.enum([
  "instagram",
  "x",
  "facebook",
  "reddit",
  "linkedin",
  "threads",
  "tiktok",
  "pinterest",
  "other",
]);

const bodySchema = z.object({
  jobId: z.string().min(1),
  candidates: z
    .array(
      z.object({
        url: z.string().url(),
        platform,
        thumbnail: z.string().url().optional(),
        title: z.string().optional(),
        provider: z.enum(["google_lens", "tineye"]),
      }),
    )
    .max(50),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AppError("bad_request", "Expected JSON {jobId, candidates}", 400);
    const job = getJob(parsed.data.jobId);
    if (!job) throw new AppError("job_not_found", "Job not found or expired", 404);

    const threshold = env.FACE_SIMILARITY_THRESHOLD;
    const matches: VerifiedCandidate[] = [];
    for (const candidate of parsed.data.candidates) {
      if (!candidate.thumbnail) continue;
      try {
        const { similarity } = await compare(job.embedding, candidate.thumbnail);
        if (similarity >= threshold) matches.push({ ...candidate, similarity });
      } catch (e) {
        console.warn(`[verify] ${candidate.url}: ${errorMessage(e)}`);
      }
    }
    matches.sort((a, b) => b.similarity - a.similarity);
    return NextResponse.json({
      matches,
      rejected: parsed.data.candidates.length - matches.length,
      threshold,
    });
  } catch (e) {
    return jsonError(e);
  }
}
