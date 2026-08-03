// Throwaway diagnostic: dump analyzeImage()'s raw metrics for a given file,
// to debug misclassification reports. Duplicates the metric computation
// (rather than editing the real lib) so nothing here can drift into prod.
import { readFileSync } from 'fs';
import sharp from 'sharp';
import { analyzeImage } from '../src/lib/image-analysis';

const THUMB = 64;

async function rawMetrics(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .resize(THUMB, THUMB, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height, n = w * h;
  let darkCount = 0, lightCount = 0, totalSat = 0;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    if (l < 64) darkCount++;
    else if (l > 192) lightCount++;
    totalSat += Math.max(r, g, b) - Math.min(r, g, b);
  }
  const bimodalFraction = (darkCount + lightCount) / n;
  const meanSaturation = totalSat / n;

  let edgeSum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -lum[(y-1)*w+(x-1)] + lum[(y-1)*w+(x+1)] - 2*lum[y*w+(x-1)] + 2*lum[y*w+(x+1)] - lum[(y+1)*w+(x-1)] + lum[(y+1)*w+(x+1)];
      const gy = -lum[(y-1)*w+(x-1)] - 2*lum[(y-1)*w+x] - lum[(y-1)*w+(x+1)] + lum[(y+1)*w+(x-1)] + 2*lum[(y+1)*w+x] + lum[(y+1)*w+(x+1)];
      edgeSum += Math.sqrt(gx*gx + gy*gy);
    }
  }
  const edgeDensity = edgeSum / ((w-2)*(h-2)) / 255;

  const colorBuckets = new Set<number>();
  const step = THUMB / 8;
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 8; cx++) {
      const i = Math.floor(cy*step)*w + Math.floor(cx*step);
      const r = Math.floor(data[i*3]/32), g = Math.floor(data[i*3+1]/32), b = Math.floor(data[i*3+2]/32);
      colorBuckets.add(r*64+g*8+b);
    }
  }

  // Candidate new signal: fraction of adjacent-pixel pairs (horiz + vert)
  // whose luminance differs by less than a small noise floor. Flat
  // illustrations are built from large contiguous same-color regions, so
  // most neighboring pixels are near-identical; real photos have
  // continuous tonal variation (sensor noise, gradients) almost
  // everywhere, so very few neighbor pairs are ever truly flat.
  let flatPairs = 0, totalPairs = 0;
  const FLAT_EPS = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < w - 1) { totalPairs++; if (Math.abs(lum[y*w+x] - lum[y*w+x+1]) < FLAT_EPS) flatPairs++; }
      if (y < h - 1) { totalPairs++; if (Math.abs(lum[y*w+x] - lum[(y+1)*w+x]) < FLAT_EPS) flatPairs++; }
    }
  }
  const flatFraction = flatPairs / totalPairs;

  return { darkCount, lightCount, n, bimodalFraction, meanSaturation, edgeDensity, colorDiversity: colorBuckets.size, flatFraction };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/test-analyze-image.ts <imageFile>');
    process.exit(2);
  }
  const buf = readFileSync(file);
  console.log('Raw metrics:', await rawMetrics(buf));
  console.log('Classification:', await analyzeImage(buf));
}

main().catch(err => { console.error(err); process.exit(1); });
