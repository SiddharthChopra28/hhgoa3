import { NextResponse } from "next/server";
import { z } from "zod";
import { recordMatch } from "@/lib/chain";
import { AppError } from "@/lib/errors";
import { jsonError, readJson } from "@/lib/http";
import { allowSpend, clientKey } from "@/lib/ratelimit";

const RECORD_COOLDOWN_MS = 30_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte 0x hex string");
const bodySchema = z.object({
  imageHash: hex32,
  faceHash: hex32,
  postUrl: z.string().url().max(2048),
});

// Also the retry endpoint after a chain error in the streamed run.
export async function POST(req: Request) {
  try {
    if (!allowSpend(clientKey(req.headers), RECORD_COOLDOWN_MS)) {
      throw new AppError("rate_limited", "Please wait before sealing again", 429);
    }
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new AppError("bad_request", `Invalid body: ${parsed.error.issues.map((i) => i.message).join("; ")}`, 400);
    }
    const receipt = await recordMatch({
      imageHash: parsed.data.imageHash as `0x${string}`,
      faceHash: parsed.data.faceHash as `0x${string}`,
      postUrl: parsed.data.postUrl,
    });
    return NextResponse.json(receipt);
  } catch (e) {
    return jsonError(e);
  }
}
