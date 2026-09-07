import { NextResponse } from "next/server";
import { explorerBase, getChain, getContractAddress, readRecord } from "@/lib/chain";
import { jsonError, readUpload } from "@/lib/http";
import { prepareImage } from "@/lib/image";
import type { VerifyExistingResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The lookup key is keccak256 of the RESIZED JPEG, not the original upload — the same
// transform the pipeline applied before sealing, so re-uploading the original still matches.
export async function POST(req: Request) {
  try {
    const file = await readUpload(req);
    const image = await prepareImage(file.bytes, file.mime);
    const record = await readRecord(image.imageHash);
    const contract = getContractAddress();
    const result: VerifyExistingResult = {
      imageHash: image.imageHash,
      found: record !== null,
      record: record ?? undefined,
      explorerContractUrl: `${explorerBase()}/address/${contract}`,
      chainId: getChain().id,
    };
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
