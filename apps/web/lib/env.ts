// Single source of configuration. Parsed lazily so importing a module never throws;
// features that need a secret raise MissingConfigError at call time instead.
import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { MissingConfigError } from "./errors";

/** Walk up from `start` looking for the pnpm workspace root. */
function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const SCHEMA_KEYS = [
  "FACE_SERVICE_URL",
  "FACE_SIMILARITY_THRESHOLD",
  "FACE_SERVICE_TIMEOUT_MS",
  "SERPAPI_API_KEY",
  "TINEYE_API_KEY",
  "SEARCH_TIMEOUT_MS",
  "BLOB_READ_WRITE_TOKEN",
  "CHAIN",
  "ARBITRUM_SEPOLIA_RPC_URL",
  "ARBITRUM_ONE_RPC_URL",
  "ETHEREUM_SEPOLIA_RPC_URL",
  "PRIVATE_KEY",
  "FACE_MATCH_REGISTRY_ADDRESS",
  "MAX_FEE_PER_GAS_GWEI",
  "TX_RECEIPT_TIMEOUT_MS",
  "MAX_UPLOAD_BYTES",
  "MAX_CANDIDATES",
] as const;

/** Load the repo-root .env only for keys the process does not already define. */
function ensureDotenv(): void {
  const missing = SCHEMA_KEYS.some((k) => !process.env[k]);
  if (!missing) return;
  const root = findRepoRoot(process.cwd());
  if (!root) return;
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  loadDotenv({ path: file, override: false, quiet: true });
}

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const num = (fallback: number) => z.coerce.number().nonnegative().default(fallback);

const schema = z.object({
  FACE_SERVICE_URL: z.string().min(1).default("http://localhost:8000"),
  FACE_SIMILARITY_THRESHOLD: num(0.5),
  FACE_SERVICE_TIMEOUT_MS: int(20_000),
  SERPAPI_API_KEY: z.string().min(1).optional(),
  TINEYE_API_KEY: z.string().min(1).optional(),
  SEARCH_TIMEOUT_MS: int(30_000),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  CHAIN: z.enum(["arbitrum-sepolia", "arbitrum-one", "ethereum-sepolia"]).default("arbitrum-sepolia"),
  ARBITRUM_SEPOLIA_RPC_URL: z.string().min(1).default("https://sepolia-rollup.arbitrum.io/rpc"),
  ARBITRUM_ONE_RPC_URL: z.string().min(1).default("https://arb1.arbitrum.io/rpc"),
  ETHEREUM_SEPOLIA_RPC_URL: z.string().min(1).default("https://ethereum-sepolia-rpc.publicnode.com"),
  PRIVATE_KEY: z
    .string()
    .regex(/^(0x)?[0-9a-fA-F]{64}$/, "PRIVATE_KEY must be 32-byte hex")
    .transform((v) => (v.startsWith("0x") ? v : `0x${v}`))
    .optional(),
  FACE_MATCH_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "FACE_MATCH_REGISTRY_ADDRESS must be a 0x address")
    .optional(),
  MAX_FEE_PER_GAS_GWEI: num(1),
  TX_RECEIPT_TIMEOUT_MS: int(90_000),
  MAX_UPLOAD_BYTES: int(5 * 1024 * 1024),
  MAX_CANDIDATES: int(15),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  ensureDotenv();
  const raw: Record<string, string> = {};
  for (const key of SCHEMA_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value.trim() !== "") raw[key] = value.trim();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: drop the memoized parse. */
export function resetEnv(): void {
  cached = null;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(loadEnv(), prop);
  },
});

/** Read an optional secret, throwing a clear "<NAME> is not set" when absent. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = loadEnv()[key];
  if (value === undefined || value === null || value === "") throw new MissingConfigError(String(key));
  return value as NonNullable<Env[K]>;
}
