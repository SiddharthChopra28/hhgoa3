import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { loadEnv } from './lib/env.js';
import { runPipeline } from './pipeline.js';
import { deployContract } from './lib/deploy.js';
import { CONFIG } from './lib/config.js';

loadEnv();

const args = process.argv.slice(2);

async function main() {
  if (args.includes('--deploy')) {
    await deployContract();
    return;
  }

  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: npm run pipeline -- <image.jpg> [--deploy]');
    console.error('  --deploy   deploy the contract instead of running a scan');
    process.exit(1);
  }

  const buffer = new Uint8Array(await readFile(file));
  const ext = basename(file).toLowerCase();
  const mime = ext.endsWith('.png') ? 'image/png' : ext.endsWith('.webp') ? 'image/webp' : ext.endsWith('.gif') ? 'image/gif' : 'image/jpeg';

  console.log(`\nFaceID pipeline: ${file} (${buffer.length} bytes)\n`);

  const emit = (e: { stage: string; status: string; payload?: Record<string, unknown> }) => {
    const pad = e.stage.padEnd(8, ' ');
    if (e.status === 'progress') {
      const p = e.payload || {};
      console.log(`  [${pad}] ${p.index || '?'}. ${String(p.pageUrl || '').slice(0, 60)}  face=${p.faceSimilarity}  social=${p.isSocial ? 'yes' : 'no'}`);
      return;
    }
    console.log(`  [${pad}] ${e.status.toUpperCase()} ${e.status === 'ok' || e.status === 'error' || e.status === 'info' ? JSON.stringify(e.payload || {}) : ''}`);
  };

  const result = await runPipeline({ buffer, filename: basename(file), mime }, emit);

  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

  const exitCode = result.status === 'matched' ? 0 : 1;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
