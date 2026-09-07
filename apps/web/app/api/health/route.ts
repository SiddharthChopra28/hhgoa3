import { NextResponse } from "next/server";
import { getContractAddress } from "@/lib/chain";
import { env } from "@/lib/env";
import { health } from "@/lib/face";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let contract: string | null = null;
  try {
    contract = getContractAddress();
  } catch {
    contract = null;
  }
  return NextResponse.json({
    ok: true,
    faceService: await health(2000),
    chain: env.CHAIN,
    contract,
  });
}
