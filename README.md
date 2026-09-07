# FaceID — Photo Provenance on-chain

A pipeline that takes a face photo, finds real social-media posts containing that
photo via **live reverse-image search**, verifies the face in each candidate, and
seals the best match on a blockchain as a tamper-evident record.

```
face scan → reverse-image search → face verification → blockchain record → on-chain re-verification
```

> **Scope:** this is **image-level provenance** ("where has this photo been posted?").
> It finds copies/near-copies of *the image* that contain the *same detected face*.
> It does **not** identify an unknown person or search the web by biometric identity.

---

## Architecture

```
┌─────────────┐   face detect + encode   ┌──────────────────┐
│  input image │ ──────────────────────▶ │ face-api.js (WASM)│  tiny_face_detector
└─────────────┘                           │  128-d descriptor │  + face_recognition
       │                                  └──────────────────┘
       ▼  keccak256 + dHash
┌─────────────┐
│   hashing   │
└─────────────┘
       │  upload public copy (catbox/tmpfiles)
       ▼
┌──────────────────────────────┐        ┌─────────────────────────────┐
│ reverse image search (SerpApi)│ ─────▶ │ Google Lens  +  Yandex     │
└──────────────────────────────┘        └─────────────────────────────┘
       │  candidates {pageUrl, imageUrl}
       ▼
┌──────────────────────────────┐
│ verify: fetch bytes, hash,   │   face cosine similarity ≥ threshold
│ dHash distance, face compare │   (social domains ranked first)
└──────────────────────────────┘
       │  best verified candidate
       ▼
┌──────────────────────────────┐        ┌────────────────────────────┐
│ evidence manifest (canonical │ ─────▶ │ FaceMatchRegistry contract  │
│ JSON) → keccak256            │  record │ (Arbitrum Sepolia / anvil)  │
└──────────────────────────────┘        └────────────────────────────┘
       │  read back getRecord()          ▲
       └─────────────────────────────────┘  (re-verify on-chain)
```

### Components

| Piece | Tech |
|---|---|
| Face detection + 128-d encoding | `@vladmandic/face-api` (`tiny_face_detector` + `face_recognition`), TF.js WASM backend — no GPU/native build needed |
| Image hashing | keccak256 (viem) + 64-bit dHash perceptual hash |
| Reverse image search | SerpApi `google_lens` and `yandex_images` (two independent indexes) |
| Temporary public hosting | `catbox.moe` or `tmpfiles.org` (free, no auth; overridable) |
| Smart contract | `FaceMatchRegistry` (Solidity, Foundry) |
| Chain client | viem |
| Orchestration | TypeScript pipeline shared by a CLI and a tiny web UI (SSE) |

### Evidence manifest

The on-chain key is the keccak256 hash of a canonical (sorted-key) JSON manifest:

```json
{
  "version": "1",
  "sourceImageHash": "0x…",
  "candidateImageHash": "0x…",
  "postUrl": "https://…",
  "provider": "google_lens | yandex_reverse",
  "faceModel": "face-api.js/tiny_face_detector+face_recognition",
  "faceScoreBps": 8734,
  "perceptualDistance": 4,
  "createdAt": "…"
}
```

The chain stores the source-image hash, candidate-image hash, post URL and face
score, keyed immutably by that manifest hash. A key can never be overwritten.

---

## Quick start

### 1. Install

```bash
npm install
curl -L https://foundry.paradigm.xyz | bash   # then: foundryup
cd contracts && forge install foundry-rs/forge-std && forge build && cd ..
```

Face models are committed under `models/` (no download needed).

### 2. Configure

```bash
cp .env.example .env
```

Minimal keys:

```bash
SERPAPI_API_KEY=...        # required for live search
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 3. Start a local chain + deploy

```bash
npm run chain:local          # anvil on :8545 (keep running)
npm run chain:deploy         # deploys FaceMatchRegistry, writes deployments/<chainId>.json
```

### 4. Run the pipeline

```bash
npm run pipeline -- ./path/to/photo.jpg
```

Or use the small web UI (open http://localhost:3000):

```bash
npm run dev
```

### 5. Smoke test (no search key needed)

`MOCK_SEARCH_URL` swaps live search for one fixed URL, exercising the full
face → verify → chain path:

```bash
MOCK_SEARCH_URL=https://files.catbox.moe/xs1tji.jpg \
  npm run pipeline -- demo/sample1.jpg
```

---

## Blockchain

Primary target: **Arbitrum Sepolia** (public testnet). Any EVM chain works — the
same code deploys to local **anvil** (chain id 31337), Arbitrum Sepolia (421614),
or Arbitrum One (42161).

For a public testnet:

```bash
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_ID=421614
PRIVATE_KEY=<funded sepolia key>
npm run chain:deploy
```

Then run a scan normally — the record is written to that network and shown with an
Arbiscan link. The `MatchRecorded` event and `getRecord` are viewable on the
explorer, proving the data was committed and can be re-verified.

---

## Verification flow

The pipeline ends by reading the record back from the contract and confirming the
stored `sourceImageHash` matches the input image. On-chain, the record is keyed by
`evidenceHash` (the manifest hash), so re-running the manifest through the same
canonical JSON → keccak256 produces the key to look up.

---

## Known limitations

- **Image-level, not identity-level.** It finds posts of *this photo*, not of a
  person. A face crop is never sent to the search engine.
- **Depends on third-party search availability and quotas.** SerpApi free tier is
  250 searches/month; Google Lens/Yandex coverage of a given post is not guaranteed.
  Post the photo publicly (and let it be indexed) before demoing.
- **Social platforms may block image fetches**, so a candidate can be found but
  not byte-verified; such candidates are reported but not sealed.
- **Face similarity threshold is heuristic** (default cosine 0.5). Tune
  `FACE_SIMILARITY_THRESHOLD` for your photos.
- **No biometric data is persisted.** Embeddings live only in memory during a run;
  only hashes are stored on-chain. The uploaded public copy is short-lived (the
  free hosts expire files after a period), but deletion is not guaranteed.
- **One record per evidence manifest.** Re-running the same image produces a new
  `createdAt`, hence a new manifest hash and a new record (by design).
- **Temporary upload goes to a third-party host** (catbox/tmpfiles by default);
  the search engine also receives the image.

---

## Repository layout

```
contracts/        Foundry project: FaceMatchRegistry.sol + tests
src/lib/          face, search, host, hash, manifest, chain, config
src/pipeline.ts   orchestration (shared by CLI + server)
src/cli.ts        command-line entry
src/server.ts     minimal web UI + SSE
models/           face-api model weights
demo/             bundled test fixtures (from the face-api project)
deployments/      deployed contract addresses + ABIs (gitignored)
```
