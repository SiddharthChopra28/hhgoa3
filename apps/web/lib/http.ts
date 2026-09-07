import { NextResponse } from "next/server";
import { AppError, UnsupportedTypeError, UploadTooLargeError, errorMessage } from "./errors";
import { env } from "./env";

export function jsonError(e: unknown, fallbackStatus = 500): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  return NextResponse.json({ error: errorMessage(e) }, { status: fallbackStatus });
}

export interface UploadedFile {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

/** Pull the `file` field out of a multipart body, enforcing the size cap. */
export async function readUpload(req: Request, field = "file"): Promise<UploadedFile> {
  const form = await req.formData();
  const value = form.get(field);
  if (!(value instanceof File)) throw new AppError("missing_file", `Missing multipart field "${field}"`, 400);
  if (value.size > env.MAX_UPLOAD_BYTES) throw new UploadTooLargeError(value.size, env.MAX_UPLOAD_BYTES);
  const mime = value.type || "application/octet-stream";
  if (!mime.toLowerCase().startsWith("image/")) throw new UnsupportedTypeError(mime);
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.byteLength > env.MAX_UPLOAD_BYTES) throw new UploadTooLargeError(bytes.byteLength, env.MAX_UPLOAD_BYTES);
  return { bytes, mime, filename: value.name || "upload.jpg" };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    throw new AppError("bad_json", "Request body is not valid JSON", 400);
  }
}
