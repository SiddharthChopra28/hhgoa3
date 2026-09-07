import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { requireEnv } from "./env";
import { errorMessage } from "./errors";

export interface HostedImage {
  url: string;
  pathname: string;
}

/** Publish the resized JPEG so reverse-image-search providers can fetch it. */
export async function hostImage(bytes: Uint8Array, jobId: string): Promise<HostedImage> {
  const token = requireEnv("BLOB_READ_WRITE_TOKEN");
  const pathname = `uploads/${jobId}-${randomUUID().slice(0, 8)}.jpg`;
  const result = await put(pathname, Buffer.from(bytes), {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    token,
  });
  return { url: result.url, pathname: result.pathname };
}

/** Runs in `finally` on every path, so it swallows everything. */
export async function deleteHosted(url: string | undefined | null): Promise<void> {
  if (!url) return;
  try {
    await del(url, { token: requireEnv("BLOB_READ_WRITE_TOKEN") });
  } catch (e) {
    console.warn(`[blob] failed to delete hosted image: ${errorMessage(e)}`);
  }
}
