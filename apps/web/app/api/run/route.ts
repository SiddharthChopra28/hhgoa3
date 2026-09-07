import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { AppError, UploadTooLargeError } from "@/lib/errors";
import { jsonError, readUpload } from "@/lib/http";
import { acquire, clientKey, release } from "@/lib/ratelimit";
import { SSE_HEADERS, pipelineStream } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientKey(req.headers);
  let held = false;
  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > env.MAX_UPLOAD_BYTES) {
      throw new UploadTooLargeError(declared, env.MAX_UPLOAD_BYTES);
    }
    if (!acquire(ip)) {
      return NextResponse.json({ error: "A job is already running for this client" }, { status: 429 });
    }
    held = true;

    const file = await readUpload(req);
    // The lock is held for the life of the stream, released when it ends or is cancelled.
    const stream = pipelineStream(
      { bytes: file.bytes, mime: file.mime, filename: file.filename },
      undefined,
      () => release(ip),
    );
    held = false;
    return new NextResponse(stream, { headers: SSE_HEADERS });
  } catch (e) {
    return jsonError(e, e instanceof AppError ? e.status : 500);
  } finally {
    if (held) release(ip);
  }
}
