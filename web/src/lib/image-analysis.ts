import sharp from 'sharp';

export type ImageType = 'photo' | 'line-art' | 'typography' | 'illustration';
export type ConversionMode = 'auto' | 'photo' | 'illustration' | 'line-art';

export interface ImageAnalysis {
  type: ImageType;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  suggestedMinWidth: number | null;
}

const THUMB = 64;

export async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
  const { data, info } = await sharp(buffer)
    .resize(THUMB, THUMB, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const n = w * h;

  // Per-pixel luminance + saturation pass
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

  // Sobel edge density on luminance thumbnail
  let edgeSum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -lum[(y - 1) * w + (x - 1)] + lum[(y - 1) * w + (x + 1)] +
        -2 * lum[y * w + (x - 1)]   + 2 * lum[y * w + (x + 1)] +
        -lum[(y + 1) * w + (x - 1)] + lum[(y + 1) * w + (x + 1)];
      const gy =
        -lum[(y - 1) * w + (x - 1)] - 2 * lum[(y - 1) * w + x] - lum[(y - 1) * w + (x + 1)] +
         lum[(y + 1) * w + (x - 1)] + 2 * lum[(y + 1) * w + x] + lum[(y + 1) * w + (x + 1)];
      edgeSum += Math.sqrt(gx * gx + gy * gy);
    }
  }
  const edgeDensity = edgeSum / ((w - 2) * (h - 2)) / 255;

  // Color diversity: coarse 8×8 grid, count distinct palette buckets (32 levels/channel)
  const colorBuckets = new Set<number>();
  const step = THUMB / 8;
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 8; cx++) {
      const i = Math.floor(cy * step) * w + Math.floor(cx * step);
      const r = Math.floor(data[i * 3] / 32);
      const g = Math.floor(data[i * 3 + 1] / 32);
      const b = Math.floor(data[i * 3 + 2] / 32);
      colorBuckets.add(r * 64 + g * 8 + b);
    }
  }
  const colorDiversity = colorBuckets.size; // 1–64

  // ── Classify ────────────────────────────────────────────────────────────────
  let type: ImageType;
  let confidence: 'high' | 'medium' | 'low';

  if (bimodalFraction > 0.65 && meanSaturation < 25) {
    // Bimodal + near-grayscale → line art or typography.
    // Widened brackets (dark<64, light>192) catch light-gray backgrounds and dark-gray outlines.
    type = edgeDensity > 0.25 ? 'typography' : 'line-art';
    confidence = bimodalFraction > 0.75 ? 'high' : 'medium';
  } else if (colorDiversity <= 12 && meanSaturation > 20) {
    // Few distinct colours, some saturation → flat illustration / logo
    type = 'illustration';
    confidence = 'medium';
  } else {
    type = 'photo';
    confidence = colorDiversity > 20 ? 'high' : 'medium';
  }

  // ── Warnings ────────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  let suggestedMinWidth: number | null = null;

  if (type === 'illustration') {
    warnings.push(
      'This looks like flat/cartoon art. Illustration mode preserves distinct colour regions better than Photo mode.'
    );
  }
  if (type === 'line-art' || type === 'typography') {
    warnings.push(
      'This looks like line art. Photo mode may blur edges — Line Art mode preserves them better.'
    );
    suggestedMinWidth = 100;
  }
  if (type === 'typography') {
    warnings.push(
      'This image contains text. Letters need at least 5 stitches each to stay readable — consider 200+ stitches wide.'
    );
    suggestedMinWidth = 200;
  }

  return { type, confidence, warnings, suggestedMinWidth };
}

// Map ImageType to the two conversion pipelines.
// Only switch to line-art pipeline when confidence is high — false positives on real
// photos (using sharpen + no overshoot) are worse than false negatives on line art.
// Medium-confidence detections still show the badge/warning so the user can override manually.
export function imageTypeToMode(type: ImageType, confidence: ImageAnalysis['confidence']): ConversionMode {
  if ((type === 'line-art' || type === 'typography') && confidence === 'high') return 'line-art';
  if (type === 'illustration') return 'illustration';
  return 'photo';
}
