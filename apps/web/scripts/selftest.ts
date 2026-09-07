#!/usr/bin/env tsx
// Lightweight assertions over the pure helpers. Run: pnpm exec tsx scripts/selftest.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
import { faceHash } from "../lib/hash";
import { prepareImage, MAX_SIDE } from "../lib/image";
import { acquire, release } from "../lib/ratelimit";
import { normalizeUrl, platformOf } from "../lib/search";
import { toFaceBox } from "../lib/face";

const tests: Array<[string, () => void | Promise<void>]> = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test("faceHash quantizes to 4 decimals and hashes the JSON-array text", () => {
  const expected = keccak256(toBytes("[1235,-5000,10000]"));
  assert.equal(faceHash([0.12345, -0.5, 1.0]), expected);
  assert.equal(faceHash([]), keccak256(toBytes("[]")));
});

test("platformOf maps social hostnames and rejects the rest", () => {
  assert.equal(platformOf("https://www.instagram.com/p/abc/"), "instagram");
  assert.equal(platformOf("https://x.com/u/status/1"), "x");
  assert.equal(platformOf("https://twitter.com/u/status/1"), "x");
  assert.equal(platformOf("https://m.facebook.com/photo"), "facebook");
  assert.equal(platformOf("https://fb.com/photo"), "facebook");
  assert.equal(platformOf("https://old.reddit.com/r/pics/x"), "reddit");
  assert.equal(platformOf("https://linkedin.com/in/x"), "linkedin");
  assert.equal(platformOf("https://www.threads.net/@a/post/1"), "threads");
  assert.equal(platformOf("https://tiktok.com/@a/video/1"), "tiktok");
  assert.equal(platformOf("https://pinterest.com/pin/1"), "pinterest");
  assert.equal(platformOf("https://www.pinterest.co.uk/pin/1"), "pinterest");
  assert.equal(platformOf("https://example.com/x"), "other");
  assert.equal(platformOf("not a url"), "other");
});

test("normalizeUrl collapses tracking noise so duplicates dedupe", () => {
  const a = normalizeUrl("https://www.Instagram.com/p/abc/?utm_source=lens&igshid=9#frag");
  const b = normalizeUrl("http://instagram.com/p/abc");
  assert.equal(a, b);
  assert.notEqual(normalizeUrl("https://instagram.com/p/abc"), normalizeUrl("https://instagram.com/p/abd"));
  assert.equal(
    normalizeUrl("https://x.com/a?b=2&a=1"),
    normalizeUrl("https://x.com/a?a=1&b=2"),
  );
});

test("toFaceBox converts [x1,y1,x2,y2] to a positive-extent box", () => {
  assert.deepEqual(toFaceBox([10, 20, 110, 220]), { x: 10, y: 20, width: 100, height: 200 });
});

test("prepareImage resizes to a 1024px longest side with a stable hash", async () => {
  const file = fileURLToPath(new URL("../../../demo/sample1.jpg", import.meta.url));
  const bytes = new Uint8Array(await readFile(file));
  const first = await prepareImage(bytes, "image/jpeg");
  const second = await prepareImage(bytes, "image/jpeg");
  assert.equal(Math.max(first.width, first.height), MAX_SIDE);
  assert.ok(first.width <= MAX_SIDE && first.height <= MAX_SIDE);
  assert.equal(first.imageHash, second.imageHash);
  assert.match(first.imageHash, /^0x[0-9a-f]{64}$/);
});

test("prepareImage rejects non-images", async () => {
  await assert.rejects(() => prepareImage(new Uint8Array([1, 2, 3]), "text/plain"), /Unsupported content type/);
});

test("rate limiter allows one active job per key", () => {
  const ip = `test-${Math.random()}`;
  assert.equal(acquire(ip), true);
  assert.equal(acquire(ip), false);
  release(ip);
  assert.equal(acquire(ip), true);
  release(ip);
});

async function main() {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      process.stdout.write(`ok   ${name}\n`);
    } catch (e) {
      failed++;
      process.stdout.write(`FAIL ${name}\n     ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  process.stdout.write(`\n${tests.length - failed}/${tests.length} passed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

void main();
