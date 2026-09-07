import sharp from "sharp";
import type { Hex } from "viem";
import { env } from "./env";
import { UnsupportedTypeError, UploadTooLargeError } from "./errors";
import { keccakBytes } from "./hash";

export const MAX_SIDE = 1024;

export interface PreparedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  imageHash: Hex;
}

/** Validate, EXIF-rotate, downscale to a 1024px longest side, re-encode as JPEG q90. */
export async function prepareImage(bytes: Uint8Array, mime: string): Promise<PreparedImage> {
  if (!mime || !mime.toLowerCase().startsWith("image/")) throw new UnsupportedTypeError(mime || "unknown");
  const max = env.MAX_UPLOAD_BYTES;
  if (bytes.byteLength > max) throw new UploadTooLargeError(bytes.byteLength, max);

  const { data, info } = await sharp(Buffer.from(bytes))
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  const out = new Uint8Array(data);
  return { bytes: out, width: info.width, height: info.height, imageHash: keccakBytes(out) };
}
