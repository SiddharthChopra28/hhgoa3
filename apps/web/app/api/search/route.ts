import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError, readJson } from "@/lib/http";
import { searchCandidates } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().url() });

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AppError("bad_request", "Expected JSON {url}", 400);
    return NextResponse.json(await searchCandidates(parsed.data.url));
  } catch (e) {
    return jsonError(e);
  }
}
