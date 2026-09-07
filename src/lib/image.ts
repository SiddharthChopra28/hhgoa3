import * as image from '@canvas/image';

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export async function decodeImage(buffer: Uint8Array): Promise<DecodedImage> {
  const canvas = await image.imageFromBuffer(Buffer.from(buffer));
  const imageData = image.getImageData(canvas);
  if (!imageData) throw new Error('failed to decode image');
  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data as Uint8ClampedArray,
  };
}

// 9x8 difference hash (dHash): 64-bit perceptual fingerprint.
// Robust to mild recompression/resizing; used to rank "same image" candidates.
export async function dHash(buffer: Uint8Array): Promise<string> {
  const { width, height, data } = await decodeImage(buffer);
  const size = 9;
  const gray = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = Math.min(width - 1, Math.floor((x * width) / size));
      const py = Math.min(height - 1, Math.floor((y * height) / size));
      const i = (py * width + px) * 4;
      gray[y * size + x] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
  }
  let bits = 0n;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      if (gray[y * size + x] > gray[y * size + x + 1]) {
        bits |= 1n << BigInt(y * (size - 1) + x);
      }
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export function hammingDistance(aHex: string, bHex: string): number {
  const a = BigInt('0x' + aHex);
  const b = BigInt('0x' + bHex);
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    x &= x - 1n;
    count++;
  }
  return count;
}
