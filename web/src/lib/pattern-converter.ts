import sharp from 'sharp';
import dmcColors from '@/data/dmc-colors.json';
import { SYMBOLS } from '@/lib/symbols';
import type { ConversionMode } from '@/lib/image-analysis';

export interface DmcColor {
  number: string;
  name: string;
  r: number;
  g: number;
  b: number;
}

export interface PatternPalette extends DmcColor {
  symbol: string;
  stitchCount: number;
}

export interface ConvertedPattern {
  grid: number[][];   // grid[y][x] = palette index
  palette: PatternPalette[];
  width: number;
  height: number;
}

const DMC: DmcColor[] = dmcColors;

// ── Color space conversion ───────────────────────────────────────────────────

type Lab = [number, number, number];

function rgbToLab(r: number, g: number, b: number): Lab {
  // sRGB → linear
  let R = r / 255, G = g / 255, B = b / 255;
  R = R > 0.04045 ? ((R + 0.055) / 1.055) ** 2.4 : R / 12.92;
  G = G > 0.04045 ? ((G + 0.055) / 1.055) ** 2.4 : G / 12.92;
  B = B > 0.04045 ? ((B + 0.055) / 1.055) ** 2.4 : B / 12.92;
  // linear RGB → XYZ D65
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.00000;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
  // XYZ → L*a*b*
  const f = (t: number) => t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function labDist2(a: Lab, b: Lab): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

// Pre-compute all DMC colors in LAB space once at module load
const DMC_LAB: Lab[] = DMC.map(c => rgbToLab(c.r, c.g, c.b));

function nearestDmcLab(lab: Lab): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < DMC_LAB.length; i++) {
    const d = labDist2(lab, DMC_LAB[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function makePrng(seed: number): () => number {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromBuffer(buf: Buffer): number {
  let h = 2166136261 >>> 0;
  const step = Math.max(1, Math.floor(buf.length / 512));
  for (let i = 0; i < buf.length; i += step) {
    h ^= buf[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ── Sampling ─────────────────────────────────────────────────────────────────

const KMEANS_MAX_SAMPLE = 6000;

// Build a sample that gives equal weight to each unique color region, so
// colors present in only a small part of the image still get representation.
function buildSample(pixels: Lab[], rand: () => number): Lab[] {
  // Coarsely quantize each pixel to a bucket key (24 levels per LAB channel).
  // Two pixels sharing a bucket are "the same color" for sampling purposes.
  const Q = 24;
  const buckets = new Map<number, Lab>();
  for (const p of pixels) {
    const key = (Math.round(p[0] / 100 * Q) * (Q + 1) + Math.round((p[1] + 128) / 256 * Q)) * (Q + 1)
              + Math.round((p[2] + 128) / 256 * Q);
    if (!buckets.has(key)) buckets.set(key, p);
  }

  const unique = Array.from(buckets.values());

  if (unique.length <= KMEANS_MAX_SAMPLE) return unique;

  // Random subsample when there are too many unique colors (Fisher-Yates partial shuffle)
  for (let i = unique.length - 1; i > unique.length - 1 - KMEANS_MAX_SAMPLE; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = unique[i]; unique[i] = unique[j]; unique[j] = tmp;
  }
  return unique.slice(unique.length - KMEANS_MAX_SAMPLE);
}

// ── k-means++ in LAB space ───────────────────────────────────────────────────

const KMEANS_MAX_ITER = 30;
const KMEANS_RUNS    = 5;   // run multiple times; pick best result
const KMEANS_OVERSHOOT = 1.5; // run with more clusters than requested so rare colors get slots

interface KMeansResult {
  centroids: Lab[];
  assignments: Int32Array;
  inertia: number;
}

function kmeansOnce(allPixels: Lab[], sample: Lab[], k: number, rand: () => number): KMeansResult {
  const n = allPixels.length;
  const ns = sample.length;
  k = Math.min(k, ns);

  // k-means++ initialisation on sample
  const centroids: Lab[] = [[...sample[Math.floor(rand() * ns)]]];
  for (let ci = 1; ci < k; ci++) {
    const dists = sample.map(p => {
      let minD = Infinity;
      for (const c of centroids) { const d = labDist2(p, c); if (d < minD) minD = d; }
      return minD;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let rnd = rand() * total;
    let chosen = ns - 1;
    for (let i = 0; i < ns; i++) { rnd -= dists[i]; if (rnd <= 0) { chosen = i; break; } }
    centroids.push([...sample[chosen]]);
  }

  // Iterate k-means on sample
  const sAssign = new Int32Array(ns);
  for (let iter = 0; iter < KMEANS_MAX_ITER; iter++) {
    let changed = false;
    for (let i = 0; i < ns; i++) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = labDist2(sample[i], centroids[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (sAssign[i] !== best) { sAssign[i] = best; changed = true; }
    }
    if (!changed) break;

    const sums: Lab[] = Array.from({ length: k }, () => [0, 0, 0] as Lab);
    const counts = new Int32Array(k);
    for (let i = 0; i < ns; i++) {
      const j = sAssign[i];
      sums[j][0] += sample[i][0]; sums[j][1] += sample[i][1]; sums[j][2] += sample[i][2];
      counts[j]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0)
        centroids[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
    }
  }

  // Assign all pixels to converged centroids; compute inertia
  const assignments = new Int32Array(n);
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < k; j++) {
      const d = labDist2(allPixels[i], centroids[j]);
      if (d < bestD) { bestD = d; best = j; }
    }
    assignments[i] = best;
    inertia += bestD;
  }

  return { centroids, assignments, inertia };
}

function kmeansLab(allPixels: Lab[], sample: Lab[], k: number, rand: () => number): KMeansResult {
  let best: KMeansResult | null = null;
  for (let run = 0; run < KMEANS_RUNS; run++) {
    const result = kmeansOnce(allPixels, sample, k, rand);
    if (!best || result.inertia < best.inertia) best = result;
  }
  return best!;
}

// ── Main converter ───────────────────────────────────────────────────────────

export async function convertImage(
  imageBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  maxColors: number,
  mode: ConversionMode = 'photo',
): Promise<ConvertedPattern> {
  const { data, info } = await (
    mode === 'line-art' || mode === 'illustration'
      ? sharp(imageBuffer).resize(targetWidth, targetHeight, { fit: 'fill', kernel: 'nearest' }).removeAlpha()
      : sharp(imageBuffer).resize(targetWidth, targetHeight, { fit: 'fill' }).removeAlpha()
  ).raw().toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const n = w * h;

  // Convert all pixels to LAB
  const pixelsLab: Lab[] = new Array(n);
  for (let i = 0; i < n; i++)
    pixelsLab[i] = rgbToLab(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);

  // Seed the PRNG from the raw file bytes so the same image always produces
  // the same clustering regardless of how many times it's run.
  const rand = makePrng(seedFromBuffer(imageBuffer));

  // Photo mode: overshoot k so rare-colour regions get dedicated cluster slots, then trim.
  // Line-art mode: use exact k — overshoot creates spurious intermediate colours on flat art.
  const sample = buildSample(pixelsLab, rand);
  const kOver = (mode === 'line-art' || mode === 'illustration')
    ? Math.min(maxColors, sample.length)
    : Math.min(Math.round(maxColors * KMEANS_OVERSHOOT), sample.length);
  const { centroids, assignments } = kmeansLab(pixelsLab, sample, kOver, rand);

  // Snap each centroid to nearest DMC color
  const centroidDmc: number[] = centroids.map(c => nearestDmcLab(c));

  // Tally pixel count per centroid, then per DMC color
  const centroidPx = new Int32Array(centroids.length);
  for (const ci of assignments) centroidPx[ci]++;

  const dmcPx = new Map<number, number>();
  for (let ci = 0; ci < centroids.length; ci++)
    dmcPx.set(centroidDmc[ci], (dmcPx.get(centroidDmc[ci]) ?? 0) + centroidPx[ci]);

  // Keep top maxColors DMC entries by pixel count
  const keepDmc = new Set(
    [...dmcPx.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors).map(([d]) => d)
  );

  // Remap dropped centroids to nearest kept centroid (in LAB space)
  const centroidFinal = centroidDmc.map((d, ci) => {
    if (keepDmc.has(d)) return d;
    let best = d, bestDist = Infinity;
    for (let cj = 0; cj < centroids.length; cj++) {
      if (!keepDmc.has(centroidDmc[cj])) continue;
      const dist = labDist2(centroids[ci], centroids[cj]);
      if (dist < bestDist) { bestDist = dist; best = centroidDmc[cj]; }
    }
    return best;
  });

  // Map each pixel to its final DMC color (guaranteed ≤ maxColors distinct values)
  const pixelDmc: number[] = Array.from(assignments, j => centroidFinal[j]);

  // Build compact palette
  const uniqueDmc = Array.from(new Set(pixelDmc));
  const dmcToIdx = new Map(uniqueDmc.map((dmc, i) => [dmc, i]));
  const flatGrid  = pixelDmc.map(dmc => dmcToIdx.get(dmc)!);

  // Count stitches per color
  const stitchCounts = new Array(uniqueDmc.length).fill(0);
  for (const v of flatGrid) stitchCounts[v]++;

  // Sort palette by stitch count desc, assign symbols
  const palette: PatternPalette[] = uniqueDmc
    .map((dmcIdx, i) => ({ ...DMC[dmcIdx], symbol: '', stitchCount: stitchCounts[i] }))
    .sort((a, b) => b.stitchCount - a.stitchCount);
  palette.forEach((p, i) => { p.symbol = SYMBOLS[i] ?? '?'; });

  // Remap grid indices to sorted palette order
  const numberToNew = new Map(palette.map((p, ni) => [p.number, ni]));
  const grid: number[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const dmcIdx = uniqueDmc[flatGrid[y * w + x]];
      return numberToNew.get(DMC[dmcIdx].number) ?? 0;
    })
  );

  return { grid, palette, width: w, height: h };
}
