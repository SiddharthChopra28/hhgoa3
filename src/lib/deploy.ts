import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(here, '../../contracts/out/FaceMatchRegistry.sol/FaceMatchRegistry.json');
const CONTRACTS_DIR = join(here, '../../contracts');
const DEPLOY_DIR = join(here, '../../deployments');

async function ensureBuilt(): Promise<string> {
  try {
    await access(ARTIFACT);
    return ARTIFACT;
  } catch {
    try {
      execFileSync('forge', ['build'], { cwd: CONTRACTS_DIR, stdio: 'inherit' });
    } catch {
      throw new Error(
        'Contract not compiled and `forge` not found. Install Foundry (https://getfoundry.sh) and run `forge install foundry-rs/forge-std` + `forge build` in contracts/.',
      );
    }
    return ARTIFACT;
  }
}

interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
}

export async function deployContract(): Promise<{ address: Hex; chainId: number; txHash: Hex; blockNumber: bigint }> {
  const rpcUrl = process.env.RPC_URL;
  const pk = process.env.PRIVATE_KEY;
  if (!rpcUrl) throw new Error('RPC_URL is not set');
  if (!pk) throw new Error('PRIVATE_KEY is not set');

  const artifact: Artifact = JSON.parse(await readFile(await ensureBuilt(), 'utf8'));
  const account = privateKeyToAccount(pk as Hex);

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const chainId = Number(process.env.CHAIN_ID || (await publicClient.getChainId()));

  const walletClient = createWalletClient({ account, transport: http(rpcUrl) });

  console.log(`Deploying FaceMatchRegistry to chain ${chainId} from ${account.address} ...`);
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    chain: null,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`Deployment failed: ${hash}`);
  }

  await mkdir(DEPLOY_DIR, { recursive: true });
  await writeFile(
    join(DEPLOY_DIR, `${chainId}.json`),
    JSON.stringify(
      {
        chainId,
        address: receipt.contractAddress,
        deployer: account.address,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
        abi: artifact.abi,
      },
      null,
      2,
    ),
  );

  console.log(`Deployed: ${receipt.contractAddress} (tx ${hash})`);
  return { address: receipt.contractAddress, chainId, txHash: hash, blockNumber: receipt.blockNumber };
}
