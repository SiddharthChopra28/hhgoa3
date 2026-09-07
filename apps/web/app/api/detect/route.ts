import { NextResponse } from "next/server";
import { z } from "zod";
import { detect, toFaceBox } from "@/lib/face";
import { AppError } from "@/lib/errors";
import { faceHash } from "@/lib/hash";
import { jsonError, readUpload } from "@/lib/http";
import { prepareImage } from "@/lib/image";
import { createJob, getJob, newJobId } from "@/lib/jobs";
import type { DetectPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ jobId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // JSON {jobId}: re-read a detection already made in this process. Image bytes are
    // never retained, so this cannot re-run detection — only replay the stored summary.
    if (!contentType.includes("multipart/form-data")) {
      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) throw new AppError("bad_request", "Expected multipart `file` or JSON {jobId}", 400);
      const job = getJob(parsed.data.jobId);
      if (!job?.detect) throw new AppError("job_not_found", "Job not found or expired", 404);
      return NextResponse.json({ jobId: parsed.data.jobId, imageHash: job.imageHash, ...job.detect });
    }

    const file = await readUpload(req);
    const image = await prepareImage(file.bytes, file.mime);
    const detection = await detect(image.bytes, file.filename);
    if (!detection) return NextResponse.json({ error: "no_face" }, { status: 422 });

    const face = detection.faces[0];
    const payload: DetectPayload = {
      faceHash: faceHash(face.embedding),
      box: toFaceBox(face.bbox),
      detScore: face.det_score,
      faceCount: detection.faces.length,
    };
    const jobId = createJob(face.embedding, image.imageHash, newJobId(), payload);
    return NextResponse.json({ jobId, imageHash: image.imageHash, ...payload });
  } catch (e) {
    return jsonError(e);
  }
}
