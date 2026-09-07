import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Evidence } from './manifest.js';

const here = dirname(fileURLToPath(import.meta.url));

export interface Deployment {
  chainId: number;
  address: Hex;
  deployer: string;
  txHash: string;
  blockNumber: number;
  abi: Abi;
}

export interface OnChainRecord {
  sourceImageHash: Hex;
  candidateImageHash: Hex;
  postUrl: string;
  faceScoreBps: number;
  timestamp: bigint;
  submitter: Hex;
}

export async function loadDeployment(): Promise<Deployment> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL is not set');

  const address = process.env.CONTRACT_ADDRESS;
  if (address) {
    const artifact = JSON.parse(await readFile(join(here, '../../contracts/out/FaceMatchRegistry.sol/FaceMatchRegistry.json'), 'utf8'));
    return {
      chainId: Number(process.env.CHAIN_ID || 0),
      address: address as Hex,
      deployer: '',
      txHash: '',
      blockNumber: 0,
      abi: artifact.abi,
    };
  }

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const chainId = Number(process.env.CHAIN_ID || (await publicClient.getChainId()));
  const depPath = join(here, '../../deployments', `${chainId}.json`);
  const dep: Deployment = JSON.parse(await readFile(depPath, 'utf8'));
  return dep;
}

export async function recordEvidence(evidence: Evidence): Promise<{ txHash: Hex; blockNumber: bigint; chainId: number; contractAddress: Hex }> {
  const rpcUrl = process.env.RPC_URL;
  const pk = process.env.PRIVATE_KEY;
  if (!rpcUrl) throw new Error('RPC_URL is not set');
  if (!pk) throw new Error('PRIVATE_KEY is not set');

  const dep = await loadDeployment();
  const account = privateKeyToAccount(pk as Hex);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: undefined, transport: http(rpcUrl) });

  const m = evidence.manifest;
  const hash = await walletClient.writeContract({
    address: dep.address,
    abi: dep.abi,
    functionName: 'record',
    chain: null,
    args: [
      evidence.manifestHash as Hex,
      m.sourceImageHash as Hex,
      m.candidateImageHash as Hex,
      m.postUrl,
      m.faceScoreBps,
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`record transaction failed: ${hash}`);

  return {
    txHash: hash,
    blockNumber: receipt.blockNumber,
    chainId: dep.chainId,
    contractAddress: dep.address,
  };
}

export async function readEvidence(evidenceHash: Hex): Promise<OnChainRecord> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL is not set');
  const dep = await loadDeployment();
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const rec = (await publicClient.readContract({
    address: dep.address,
    abi: dep.abi,
    functionName: 'getRecord',
    args: [evidenceHash],
  })) as OnChainRecord;
  return rec;
}

export function explorerUrl(chainId: number): string {
  if (chainId === 42161) return 'https://arbiscan.io';
  if (chainId === 421614) return 'https://sepolia.arbiscan.io';
  return ''; // local chains have no block explorer
}
