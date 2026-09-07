# Photo Provenance Registry

A pipeline that takes an uploaded photo, encodes the face it contains, finds public social-media posts containing that photo through live reverse-image search, verifies that each candidate actually shows the same face, and seals the best match on Arbitrum One as a tamper-evident record.

Scope: this is image-level provenance ("where has this photo been posted?"), not identity search ("who is this person?"). The face embedding is used only to verify candidates returned by reverse-image search. It is never used to search by face, and it never leaves the server.

## Blockchain

| Item | Value |
|---|---|
| Network | Arbitrum One (chain id 42161) |
| Contract | `FaceMatchRegistry` at `<ARBITRUM_ONE_CONTRACT_ADDRESS>` |
| Arbiscan | `<ARBITRUM_ONE_ARBISCAN_CONTRACT_URL>` |
| Example transaction | `<ARBITRUM_ONE_EXAMPLE_TX_URL>` |
| Test deployment | Ethereum Sepolia (chain id 11155111) at [`0x5A1cf0835F8CF7cfCFc0b2d59B3fb8865EE65e87`](https://sepolia.etherscan.io/address/0x5A1cf0835F8CF7cfCFc0b2d59B3fb8865EE65e87), source [verified on Etherscan](https://sepolia.etherscan.io/address/0x5A1cf0835F8CF7cfCFc0b2d59B3fb8865EE65e87#code) |
| Test deployment tx | [`0x238aff84…727d04`](https://sepolia.etherscan.io/tx/0x238aff84e54344432a4ff34c9dc7fd0bd9cd78f33fad97f65a5ca53e2c727d04) |
| Test sealed record | [`0x27a6113d…bae48a`](https://sepolia.etherscan.io/tx/0x27a6113d90c864b48760718a1d753a555bab53f1976113b45c35ff8e68bae48a) (`MatchRecorded` for `demo/virat.jpg`) |

The contract stores one record per image hash. Each record holds the keccak256 hash of the normalised image, the keccak256 hash of the face embedding, the URL of the matching post, the block timestamp and the submitting address, and emits a `MatchRecorded` event with the same data.

## Architecture

```
                 +-------------------+
   photo  -----> |  apps/web (Next)  |  route handlers + SSE stream + CLI
                 +---------+---------+
                           |
        +------------------+------------------+---------------------+
        v                  v                  v                     v
+---------------+  +---------------+  +----------------+  +--------------------+
| services/face |  | Vercel Blob   |  | SerpApi Lens   |  | FaceMatchRegistry  |
| FastAPI       |  | temp public   |  | (TinEye        |  | Solidity, Arbitrum |
| InsightFace   |  | URL, deleted  |  |  fallback)     |  | One via viem       |
| buffalo_l     |  | after run     |  |                |  |                    |
+---------------+  +---------------+  +----------------+  +--------------------+
```

Pipeline stages, in order:

1. `upload`: validate (image, at most 5 MB), auto-rotate and resize to a 1024 px longest side, compute `imageHash = keccak256(resized bytes)`, upload to a temporary public URL.
2. `detect`: send the resized image to the face service, take the largest face, keep its 512-d ArcFace embedding in server memory, compute `faceHash` from a deterministic serialisation of the rounded embedding.
3. `search`: reverse-image search the temporary URL with Google Lens (SerpApi), filter results to social platforms, deduplicate, fall back to TinEye on zero results or quota errors.
4. `verify`: for each candidate, the face service downloads the full-size image reported by the search provider (falling back to the thumbnail), detects faces and returns the maximum cosine similarity to the stored embedding. Candidates at or above the threshold (default 0.5) are kept and sorted.
5. `record`: write `(imageHash, faceHash, bestPostUrl)` to the registry with a capped gas price, wait for the receipt and return the transaction and block.

The temporary upload is deleted in a `finally` block on every path. The embedding is dropped from memory when the run ends or after ten minutes.

## Repository layout

```
apps/web         Next.js App Router app: UI, API route handlers, CLI script
services/face    FastAPI service wrapping InsightFace buffalo_l
contracts        Foundry project: FaceMatchRegistry.sol, tests, deploy script
docker-compose.yml
.env.example
```

## Stack

| Stage | Choice |
|---|---|
| Face detection and encoding | InsightFace `buffalo_l` (SCRFD + ArcFace, 512-d) on onnxruntime, FastAPI |
| Reverse image search | SerpApi `google_lens`, TinEye REST API as fallback |
| Temporary public link | Vercel Blob, deleted after each run |
| Chain | Solidity `FaceMatchRegistry`, Foundry, Arbitrum One (Arbitrum Sepolia for development) |
| Chain client | viem, server side only |
| Web app | Next.js App Router, TypeScript, Tailwind, Framer Motion, shadcn-style primitives |
| Image processing | sharp |

## Prerequisites

- Node 22 and pnpm 10
- Python 3.12 and `uv` (or Docker for the face service)
- Foundry (`forge`, `cast`, `anvil`)
- Accounts: SerpApi, TinEye (optional), Vercel Blob, an Arbitrum RPC endpoint, a funded server wallet

## Configuration

Copy `.env.example` to `.env` at the repository root and fill in the values. Both the web app and the face service read this file.

| Variable | Purpose |
|---|---|
| `FACE_SERVICE_URL` | Base URL of the face service, default `http://localhost:8000` |
| `FACE_SIMILARITY_THRESHOLD` | Cosine similarity required to accept a candidate, default `0.5` |
| `SERPAPI_API_KEY` | SerpApi key for Google Lens |
| `TINEYE_API_KEY` | Optional TinEye key used as fallback |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for the temporary upload |
| `CHAIN` | `arbitrum-one` (production), `arbitrum-sepolia` or `ethereum-sepolia` (dry runs) |
| `ARBITRUM_ONE_RPC_URL`, `ARBITRUM_SEPOLIA_RPC_URL`, `ETHEREUM_SEPOLIA_RPC_URL` | RPC endpoints |
| `PRIVATE_KEY` | Server wallet used to submit records |
| `FACE_MATCH_REGISTRY_ADDRESS` | Optional override of the address in `apps/web/lib/contract.ts` |
| `MAX_FEE_PER_GAS_GWEI` | Gas price cap for the write, default `1` |
| `MAX_UPLOAD_BYTES` | Upload limit, default 5 MB |
| `ARBISCAN_API_KEY` | Used by Foundry to verify the contract source on Arbiscan |

Timeouts: face service 20 s, search 30 s, transaction receipt 90 s.

## Running

### 1. Face service

With Docker (models are downloaded at build time):

```
docker compose up --build face
```

Or locally:

```
cd services/face
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Check with `curl localhost:8000/health`.

### 2. Web app

```
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

### 3. Command line

The CLI runs the same pipeline functions as the web app and prints the result as JSON:

```
pnpm run:cli ./photo.jpg
pnpm run:cli --check ./photo.jpg     # look up an existing record for this image
pnpm run:cli --no-chain ./photo.jpg  # run everything except the on-chain write
```

Exit codes: 0 sealed or dry run, 2 no face or no matches, 1 error.

### 4. Tests

```
pnpm --filter web selftest          # hashing, URL normalisation, image normalisation, rate limiter
cd services/face && .venv/bin/pytest tests/   # keccak and face-hash vectors shared with the Node side
cd contracts && forge test
```

## Contract

```
cd contracts
forge install foundry-rs/forge-std
forge build
forge test
```

Deploy and verify (Arbitrum Sepolia shown; use `arbitrum_one` for mainnet):

```
export PRIVATE_KEY=0x...
export ARBITRUM_SEPOLIA_RPC_URL=...
export ARBISCAN_API_KEY=...
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
./export-abi.sh
```

Then put the deployed address into `apps/web/lib/contract.ts` (or set `FACE_MATCH_REGISTRY_ADDRESS`).

For an Ethereum Sepolia dry run use `--rpc-url ethereum_sepolia` and set `CHAIN=ethereum-sepolia`. L1 Sepolia gas is around 1 gwei, so raise `MAX_FEE_PER_GAS_GWEI` to about 5 there; the default of 1 is sized for Arbitrum.

## API

All routes live under `apps/web/app/api` and run on the Node runtime.

| Route | Method | Purpose |
|---|---|---|
| `/api/run` | POST multipart `file` | Full pipeline as a Server-Sent Events stream |
| `/api/upload` | POST multipart `file` | Normalise, hash and host the image |
| `/api/detect` | POST | Detect the face and store the embedding under a job id |
| `/api/search` | POST `{url}` | Reverse-image search |
| `/api/verify` | POST `{jobId, candidates}` | Face-verify candidates |
| `/api/record` | POST `{imageHash, faceHash, postUrl}` | Write a record (also used to retry a failed seal) |
| `/api/verify-existing` | POST multipart `file` | Hash an image and read its record from the chain |
| `/api/health` | GET | Service status |

`/api/run` accepts one active job per client IP.

## Hashes

- `imageHash`: keccak256 of the resized JPEG bytes. The same normalisation runs on "Check a record", so a re-uploaded original yields the same hash.
- `faceHash`: keccak256 of the UTF-8 string `[v1,v2,...,v512]` where each `vi = floor(embedding[i] * 10000 + 0.5)`. The Node and Python implementations are tested against the same vectors.

## Limitations

- Image-level, not identity-level. The system finds posts of this photo (or close variants that still contain the same face). It does not find other photos of the same person.
- Depends on third-party search availability and quotas. SerpApi and TinEye coverage of a given post is not guaranteed; a post must be indexed before it can be found.
- Social platforms may block thumbnail fetches, in which case a candidate is found but cannot be verified and is not sealed.
- The similarity threshold is a heuristic tuned on a handful of photos.
- No biometric data is persisted. Embeddings live only in server memory during a run. Only hashes are written on-chain.
- One record per image hash. Re-running the same image overwrites the previous record.
- The temporary public upload exists for the duration of one run and is deleted afterwards, but the search providers receive the image.

## License

MIT
