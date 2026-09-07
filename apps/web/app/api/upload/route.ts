import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteHosted, hostImage } from "@/lib/blob";
import { AppError } from "@/lib/errors";
import { jsonError, readJson, readUpload } from "@/lib/http";
import { prepareImage } from "@/lib/image";
import { newJobId } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const file = await readUpload(req);
    const image = await prepareImage(file.bytes, file.mime);
    const jobId = newJobId();
    const hosted = await hostImage(image.bytes, jobId);
    return NextResponse.json({
      url: hosted.url,
      imageHash: image.imageHash,
      jobId,
      width: image.width,
      height: image.height,
    });
  } catch (e) {
    return jsonError(e);
  }
}

const deleteSchema = z.object({ url: z.string().url() });

// Callers of the standalone upload own the blob's lifetime; this lets them release it.
export async function DELETE(req: Request) {
  try {
    const parsed = deleteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AppError("bad_request", "Expected JSON {url}", 400);
    if (!new URL(parsed.data.url).hostname.endsWith(".vercel-storage.com")) {
      throw new AppError("bad_request", "Not a hosted upload URL", 400);
    }
    await deleteHosted(parsed.data.url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
