# contracts

Foundry project for `FaceMatchRegistry`, an on-chain registry of face-match
records keyed by image hash.

## Build

```bash
forge build
```

## Test

```bash
forge test -vv
```

## Deploy

Deployment reads `PRIVATE_KEY` and broadcasts via `script/Deploy.s.sol`.
RPC URLs come from `ARBITRUM_SEPOLIA_RPC_URL` / `ARBITRUM_ONE_RPC_URL`, and
contract verification uses `ARBISCAN_API_KEY` (both configured in
`foundry.toml` under `[rpc_endpoints]` and `[etherscan]`).

Arbitrum Sepolia:

```bash
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
```

Arbitrum One:

```bash
forge script script/Deploy.s.sol --rpc-url arbitrum_one --broadcast --verify
```

Required environment variables: `PRIVATE_KEY`, `ARBITRUM_SEPOLIA_RPC_URL`,
`ARBITRUM_ONE_RPC_URL`, `ARBISCAN_API_KEY`.

## Standalone verification

If `--verify` was skipped or failed during deployment, verify manually:

```bash
forge verify-contract <deployed_address> src/FaceMatchRegistry.sol:FaceMatchRegistry \
  --chain arbitrum_sepolia \
  --etherscan-api-key "$ARBISCAN_API_KEY"
```

Use `--chain arbitrum_one` for the mainnet deployment.

## Export ABI

`export-abi.sh` builds the contract and writes the ABI plus a
`CONTRACT_ADDRESSES` map to `../apps/web/lib/contract.ts`. Existing address
values in that file are preserved across re-runs.

```bash
./export-abi.sh
```

Set `FACE_MATCH_REGISTRY_ADDRESS` to override the exported address at
runtime instead of editing the generated file by hand.
