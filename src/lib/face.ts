import * as tf from '@tensorflow/tfjs';
import * as wasm from '@tensorflow/tfjs-backend-wasm';
import * as image from '@canvas/image';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

const MODEL_DIR = new URL('../../models/', import.meta.url).pathname;
const WASM_DIR = require.resolve('@tensorflow/tfjs-backend-wasm/package.json').replace('package.json', 'dist/');

let ready = false;

export async function initFace() {
  if (ready) return faceapi;
  wasm.setWasmPaths(WASM_DIR);
  await tf.setBackend('wasm');
  await tf.ready();
  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
  ready = true;
  return faceapi;
}

async function imageToTensor(buffer: Uint8Array) {
  const canvas = await image.imageFromBuffer(Buffer.from(buffer));
  const imageData = image.getImageData(canvas);
  return tf.tidy(() => {
    const data = tf.tensor(Array.from(imageData?.data || []), [canvas.height, canvas.width, 4], 'int32');
    const channels = tf.split(data, 4, 2);
    const rgb = tf.stack([channels[0], channels[1], channels[2]], 2);
    return tf.squeeze(rgb);
  });
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

export interface DetectResult {
  faces: { score: number; box: FaceBox }[];
  best: { score: number; box: FaceBox; descriptor: number[] };
}

interface RawDetection {
  detection: {
    score: number;
    box: { x: number; y: number; width: number; height: number };
    imageWidth: number;
    imageHeight: number;
  };
  descriptor: Float32Array;
}

function boxFromDetection(det: RawDetection): FaceBox {
  const box = det.detection.box;
  return {
    x: Math.max(0, Math.round(box.x)),
    y: Math.max(0, Math.round(box.y)),
    width: Math.round(box.width),
    height: Math.round(box.height),
    imageWidth: det.detection.imageWidth,
    imageHeight: det.detection.imageHeight,
  };
}

export async function detectFace(buffer: Uint8Array, minConfidence = 0.5): Promise<DetectResult | null> {
  const fa = await initFace();
  const tensor = await imageToTensor(buffer);
  try {
    const result: RawDetection[] = await fa
      .detectAllFaces(tensor, new fa.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    if (!result.length) return null;
    result.sort((a, b) => b.detection.score - a.detection.score);
    const best = result[0];
    return {
      faces: result.map((r) => ({ score: r.detection.score, box: boxFromDetection(r) })),
      best: {
        score: best.detection.score,
        box: boxFromDetection(best),
        descriptor: Array.from(best.descriptor),
      },
    };
  } finally {
    tf.dispose(tensor);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export async function compareFace(buffer: Uint8Array, referenceDescriptor: number[], minConfidence = 0.4): Promise<number> {
  const det = await detectFace(buffer, minConfidence);
  if (!det) return 0;
  return cosineSimilarity(referenceDescriptor, det.best.descriptor);
}

if (process.argv[1] && process.argv[1].endsWith('face.ts') && process.argv.includes('--smoke')) {
  const { readFile } = await import('node:fs/promises');
  const buf = new Uint8Array(await readFile(new URL('../../demo/sample1.jpg', import.meta.url)));
  const t0 = Date.now();
  const det = await detectFace(buf);
  console.log('backend:', tf.getBackend());
  console.log('faces detected:', det ? det.faces.length : 0);
  console.log('best score:', det?.best.score);
  console.log('descriptor len:', det?.best.descriptor.length);
  console.log('ms:', Date.now() - t0);
}
