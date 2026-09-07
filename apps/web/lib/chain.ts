import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatGwei,
  http,
  parseGwei,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia, sepolia } from "viem/chains";
import { CONTRACT_ADDRESSES, FACE_MATCH_REGISTRY_ABI } from "./contract";
import { env, requireEnv } from "./env";
import { AppError, GasTooHighError } from "./errors";
import { log } from "./log";
import type { ChainReceipt, OnChainRecord } from "./types";

interface ChainConfig {
  chain: Chain;
  rpc: () => string;
  explorer: string;
}

// Arbitrum One is the production target; the two Sepolias are for dry runs.
const CHAINS: Record<typeof env.CHAIN, ChainConfig> = {
  "arbitrum-one": { chain: arbitrum, rpc: () => env.ARBITRUM_ONE_RPC_URL, explorer: "https://arbiscan.io" },
  "arbitrum-sepolia": { chain: arbitrumSepolia, rpc: () => env.ARBITRUM_SEPOLIA_RPC_URL, explorer: "https://sepolia.arbiscan.io" },
  "ethereum-sepolia": { chain: sepolia, rpc: () => env.ETHEREUM_SEPOLIA_RPC_URL, explorer: "https://sepolia.etherscan.io" },
};

export function getChain(): Chain {
  return CHAINS[env.CHAIN].chain;
}

function rpcUrl(): string {
  return CHAINS[env.CHAIN].rpc();
}

export function explorerBase(): string {
  return CHAINS[env.CHAIN].explorer;
}

export function getContractAddress(): Hex {
  const override = env.FACE_MATCH_REGISTRY_ADDRESS;
  if (override) return override as Hex;
  const chain = getChain();
  const address = CONTRACT_ADDRESSES[chain.id];
  if (!address) throw new AppError("contract_not_configured", `contract address not configured for chain ${chain.id}`);
  return address;
}

export function getPublicClient(): PublicClient {
  return createPublicClient({ chain: getChain(), transport: http(rpcUrl()) });
}

function getWalletClient() {
  const key = requireEnv("PRIVATE_KEY") as Hex;
  return createWalletClient({ account: privateKeyToAccount(key), chain: getChain(), transport: http(rpcUrl()) });
}

export interface RecordMatchInput {
  imageHash: Hex;
  faceHash: Hex;
  postUrl: string;
}

/** Write the match on-chain under a hard maxFeePerGas cap, then wait for the receipt. */
export async function recordMatch(input: RecordMatchInput): Promise<ChainReceipt> {
  const chain = getChain();
  const contractAddress = getContractAddress();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  const cap = parseGwei(String(env.MAX_FEE_PER_GAS_GWEI));
  const fees = await publicClient.estimateFeesPerGas();
  const networkMax = fees.maxFeePerGas ?? 0n;
  if (networkMax > cap) {
    throw new GasTooHighError(formatGwei(networkMax), formatGwei(cap));
  }
  const priority = fees.maxPriorityFeePerGas ?? 0n;

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: FACE_MATCH_REGISTRY_ABI,
    functionName: "record",
    args: [input.imageHash, input.faceHash, input.postUrl],
    chain,
    account: walletClient.account,
    maxFeePerGas: cap,
    maxPriorityFeePerGas: priority > cap ? cap : priority,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: env.TX_RECEIPT_TIMEOUT_MS,
  });

  const gasCostWei = receipt.gasUsed * receipt.effectiveGasPrice;
  log(`[chain] tx ${txHash} used ${receipt.gasUsed} gas, cost ${formatEther(gasCostWei)} ETH`);

  const base = explorerBase();
  return {
    chainId: chain.id,
    contractAddress,
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    explorerTxUrl: `${base}/tx/${txHash}`,
    explorerContractUrl: `${base}/address/${contractAddress}`,
    gasCostWei: gasCostWei.toString(),
  };
}

/** Read a sealed record; null when the slot is empty (timestamp 0). */
export async function readRecord(imageHash: Hex): Promise<OnChainRecord | null> {
  const record = await getPublicClient().readContract({
    address: getContractAddress(),
    abi: FACE_MATCH_REGISTRY_ABI,
    functionName: "getRecord",
    args: [imageHash],
  });
  if (record.timestamp === 0n) return null;
  return {
    imageHash: record.imageHash,
    faceHash: record.faceHash,
    postUrl: record.postUrl,
    timestamp: Number(record.timestamp),
    submitter: record.submitter,
  };
}
