import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/env.js';
import { runPipeline } from './pipeline.js';
import { CONFIG } from './lib/config.js';

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '../public');

function sendJson(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleRun(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  req.on('error', () => {
    /* client aborted */
  });
  req.on('data', (c: Buffer) => {
    if (tooLarge) return;
    chunks.push(c);
    size += c.length;
    if (size > CONFIG.maxImageBytes) {
      tooLarge = true;
      sendJson(res, 413, { error: 'image too large' });
    }
  });
  req.on('end', async () => {
    if (tooLarge) return;
    const buffer = new Uint8Array(Buffer.concat(chunks));
    const filename = (req.headers['x-filename'] as string) || 'upload.jpg';
    const mime = req.headers['content-type'] || 'image/jpeg';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const emit = (e: { stage: string; status: string; payload?: Record<string, unknown> }) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };

    try {
      const result = await runPipeline({ buffer, filename, mime }, emit);
      res.write(`data: ${JSON.stringify({ stage: 'done', status: 'ok', result })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ stage: 'done', status: 'error', result: { error: (e as Error).message } })}\n\n`);
    } finally {
      res.end();
    }
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/api/run' && req.method === 'POST') {
    try {
      await handleRun(req, res);
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
    return;
  }
  if (url.pathname === '/api/config') {
    sendJson(res, 200, { faceSimilarityThreshold: CONFIG.faceSimilarityThreshold, chainWriteEnabled: CONFIG.chainWriteEnabled });
    return;
  }
  if (url.pathname === '/') {
    const html = await readFile(join(PUBLIC, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
  const file = url.pathname.slice(1).split('/').filter(Boolean).join('/');
  const ext = '.' + (file.split('.').pop() || '');
  if (MIME[ext]) {
    try {
      const body = await readFile(join(PUBLIC, file), 'utf8');
      res.writeHead(200, { 'Content-Type': MIME[ext] });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`FaceID pipeline UI: http://localhost:${port}`);
});
