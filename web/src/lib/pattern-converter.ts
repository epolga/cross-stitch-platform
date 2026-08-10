import sharp from 'sharp';
import dmcColors from '@/data/dmc-colors.json';
import { symbolForIndex } from '@/lib/symbols';
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

// ── Alpha-transparency handling ──────────────────────────────────────────────
//
// Added 2026-08-08 after a real bug was found: sharp's removeAlpha() does
// NOT composite onto any background — it just drops the alpha channel,
// leaving whatever RGB the encoder happened to store under transparent
// pixels (often [0,0,0] — pure black — confirmed on a real OpenAI-generated
// PNG). convertImage() is called directly (no pre-flatten) from the public
// /api/convert route, so any real user uploading a PNG with genuine alpha
// transparency (clipart, a sticker, a screenshot) got a BLACK background in
// their pattern instead of white. Fixed by always decoding with an explicit
// alpha channel (ensureAlpha() — a safe no-op that adds fully-opaque alpha
// to images that don't have one) and compositing onto white ourselves, plus
// tracking which cells were transparent so they become empty (-1) stitches
// instead of a spurious "white background" color competing for a maxColors
// slot. For an opaque source image (the overwhelming majority of uploads)
// this is provably a no-op: ensureAlpha() adds alpha=255 everywhere, so
// compositeOntoWhite's blend formula reduces to the identity and the
// transparent mask is all-false.
const ALPHA_THRESHOLD = 128; // 0-255; below this, a cell is treated as empty

// Composites RGBA (straight, not premultiplied — sharp's raw output is
// straight alpha) onto a solid white background: out = src*a + 255*(1-a).
// Also returns which pixels are "transparent enough" to become empty
// stitches rather than a real (white) color.
function compositeOntoWhite(rgba: Buffer, channels: number, n: number): { rgb: Buffer; transparent: Uint8Array } {
  const rgb = Buffer.alloc(n * 3);
  const transparent = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * channels + 3];
    if (a < ALPHA_THRESHOLD) transparent[i] = 1;
    for (let c = 0; c < 3; c++) {
      const src = rgba[i * channels + c];
      rgb[i * 3 + c] = Math.round((src * a + 255 * (255 - a)) / 255);
    }
  }
  return { rgb, transparent };
}

// Decodes a sharp pipeline's raw pixels with alpha explicitly handled (see
// above), rather than the naive `.removeAlpha()` this replaces everywhere
// in this file.
async function decodeComposited(pipeline: ReturnType<typeof sharp>): Promise<{ data: Buffer; transparent: Uint8Array; width: number; height: number }> {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const { rgb, transparent } = compositeOntoWhite(data, info.channels, n);
  return { data: rgb, transparent, width: info.width, height: info.height };
}

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

function labToRgb([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const finv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = finv(fx) * 0.95047;
  const Y = finv(fy) * 1.00000;
  const Z = finv(fz) * 1.08883;
  let R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  let G = X * -0.9692660 + Y * 1.8760108 + Z * 0.0415560;
  let B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;
  const gamma = (c: number) => (c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c);
  R = gamma(R); G = gamma(G); B = gamma(B);
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255)));
  return [clamp(R), clamp(G), clamp(B)];
}

// CIEDE2000 (Sharma, Wu & Dalal 2005 reference formula) — a perceptually
// weighted color-distance metric, unlike CIE76's naive Euclidean distance
// in LAB space. Substantially more expensive (several sqrt/atan2/sin/cos
// per call) — see DistanceMode below for where each metric is actually used.
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function ciede2000(labA: Lab, labB: Lab): number {
  const [L1, a1, b1] = labA;
  const [L2, a2, b2] = labB;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const hp = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) * RAD2DEG;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG2RAD);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * DEG2RAD)
    + 0.24 * Math.cos((2 * hbarp) * DEG2RAD)
    + 0.32 * Math.cos((3 * hbarp + 6) * DEG2RAD)
    - 0.20 * Math.cos((4 * hbarp - 63) * DEG2RAD);

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * DEG2RAD) * Rc;

  const lTerm = dLp / Sl;
  const cTerm = dCp / Sc;
  const hTerm = dHp / Sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + Rt * cTerm * hTerm);
}

// Where CIEDE2000 gets used, given it's ~10-20x more expensive than CIE76:
// - 'cie76': current/baseline behavior everywhere (fast).
// - 'final-only': CIE76 for k-means clustering internals (invisible to the
//   user, just an implementation detail for grouping similar pixels), but
//   CIEDE2000 for the actual DMC-thread color match — the step a user can
//   perceive ("does this suggested color look like my photo").
// - 'everywhere': CIEDE2000 for clustering too — theoretically more
//   perceptually-even color grouping, but k-means's centroid-averaging step
//   still assumes a roughly-Euclidean space, so this is a heuristic
//   deviation from classic Lloyd's-algorithm guarantees, not a pure win.
export type ColorDistanceMode = 'cie76' | 'final-only' | 'everywhere';

function makeDistanceFns(mode: ColorDistanceMode) {
  const clusterDist = mode === 'everywhere' ? ciede2000 : labDist2;
  const finalDist = mode === 'cie76' ? labDist2 : ciede2000;
  return { clusterDist, finalDist };
}

// Pre-compute all DMC colors in LAB space once at module load
const DMC_LAB: Lab[] = DMC.map(c => rgbToLab(c.r, c.g, c.b));

function nearestDmcLab(lab: Lab, dist: (a: Lab, b: Lab) => number): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < DMC_LAB.length; i++) {
    const d = dist(lab, DMC_LAB[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Real DMC thread inventory doesn't have infinitely fine gradation — two
// genuinely different source shades can both snap to the SAME nearest
// thread (confirmed live: a ghost's near-white body vs a near-white
// background, real Lab averages 4 units apart, both closest to the same
// single "off-white" thread — there's no second thread that close). When
// that happens and the two regions still need to render as visually
// distinct, fall back to the next-nearest DISTINCT thread rather than
// giving up — a slightly-less-exact color match that's still visible
// beats an exact match that's invisible against its neighbor.
function nearestDmcLabExcluding(lab: Lab, dist: (a: Lab, b: Lab) => number, exclude: number): number {
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < DMC_LAB.length; i++) {
    if (i === exclude) continue;
    const d = dist(lab, DMC_LAB[i]);
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

// k-means++ init + Lloyd's iteration, fit on the sample only (cheap — sample
// is capped at KMEANS_MAX_SAMPLE regardless of source resolution).
function fitCentroids(sample: Lab[], k: number, rand: () => number, dist: (a: Lab, b: Lab) => number): { centroids: Lab[]; inertia: number } {
  const ns = sample.length;
  k = Math.min(k, ns);

  const centroids: Lab[] = [[...sample[Math.floor(rand() * ns)]]];
  for (let ci = 1; ci < k; ci++) {
    const dists = sample.map(p => {
      let minD = Infinity;
      for (const c of centroids) { const d = dist(p, c); if (d < minD) minD = d; }
      return minD;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let rnd = rand() * total;
    let chosen = ns - 1;
    for (let i = 0; i < ns; i++) { rnd -= dists[i]; if (rnd <= 0) { chosen = i; break; } }
    centroids.push([...sample[chosen]]);
  }

  const sAssign = new Int32Array(ns);
  for (let iter = 0; iter < KMEANS_MAX_ITER; iter++) {
    let changed = false;
    for (let i = 0; i < ns; i++) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = dist(sample[i], centroids[j]);
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

  let inertia = 0;
  for (let i = 0; i < ns; i++) {
    let bestD = Infinity;
    for (const c of centroids) { const d = dist(sample[i], c); if (d < bestD) bestD = d; }
    inertia += bestD;
  }
  return { centroids, inertia };
}

function assignAll(allPixels: Lab[], centroids: Lab[], dist: (a: Lab, b: Lab) => number): { assignments: Int32Array; inertia: number } {
  const n = allPixels.length;
  const assignments = new Int32Array(n);
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < centroids.length; j++) {
      const d = dist(allPixels[i], centroids[j]);
      if (d < bestD) { bestD = d; best = j; }
    }
    assignments[i] = best;
    inertia += bestD;
  }
  return { assignments, inertia };
}

function kmeansOnce(allPixels: Lab[], sample: Lab[], k: number, rand: () => number, dist: (a: Lab, b: Lab) => number): KMeansResult {
  const { centroids } = fitCentroids(sample, k, rand, dist);
  const { assignments, inertia } = assignAll(allPixels, centroids, dist);
  return { centroids, assignments, inertia };
}

function kmeansLab(allPixels: Lab[], sample: Lab[], k: number, rand: () => number, dist: (a: Lab, b: Lab) => number): KMeansResult {
  let best: KMeansResult | null = null;
  for (let run = 0; run < KMEANS_RUNS; run++) {
    const result = kmeansOnce(allPixels, sample, k, rand, dist);
    if (!best || result.inertia < best.inertia) best = result;
  }
  return best!;
}

// Same idea as kmeansLab, but picks the best of KMEANS_RUNS by SAMPLE
// inertia and only assigns the full pixel set once at the end, instead of
// once per run — the full-resolution source this feeds (see
// OUTLINE_QUANTIZE_COLORS below) can be orders of magnitude larger than the
// target stitch grid kmeansLab normally runs against, so repeating a full
// assignment pass per run would be wasteful.
function kmeansQuantize(allPixels: Lab[], sample: Lab[], k: number, rand: () => number, dist: (a: Lab, b: Lab) => number): { centroids: Lab[]; assignments: Int32Array } {
  let best: { centroids: Lab[]; inertia: number } | null = null;
  for (let run = 0; run < KMEANS_RUNS; run++) {
    const result = fitCentroids(sample, k, rand, dist);
    if (!best || result.inertia < best.inertia) best = result;
  }
  const { assignments } = assignAll(allPixels, best!.centroids, dist);
  return { centroids: best!.centroids, assignments };
}

// ── Outline preservation (illustration/line-art mode) ───────────────────────
//
// Flat illustrations typically separate color regions with a thin white
// (or near-white) outline stroke, and reuse the same stroke for small
// details like an eye's specular highlight. Downsampling straight to
// stitch-grid resolution routinely loses these: a 1-2px stroke rarely lands
// on a nearest-neighbor sample point, and even where it survives, it's such
// a small minority of total pixels that the color-reduction step's
// "keep top N colors by pixel count" trims it away, blending it into
// whatever region it bordered. Detecting these strokes on the FULL-resolution
// source (before any downsampling blurs them) and force-writing a protected
// outline color onto the final grid — after normal clustering, bypassing the
// pixel-count trim entirely — fixes this regardless of maxColors.
//
// A gradient/edge detector can't tell a genuine thin stroke apart from an
// ordinary boundary between two flat color regions — both produce a
// similarly narrow band of high gradient. What actually distinguishes a
// stroke is WIDTH: a deliberate keyline or highlight dot is a few pixels of
// fairly consistent color inserted between regions, narrower than a
// structuring element sized to it, whereas a plain region boundary (even
// with 1-2px anti-aliasing) has no such band — it's just the transition
// itself. Morphological opening/closing is the standard tool for exactly
// this: removing (and by taking the difference, isolating) features
// narrower than a given structuring element while leaving large flat
// regions untouched. Taking both the white top-hat (opening difference —
// finds features BRIGHTER than their surroundings) and the black top-hat
// (closing difference — finds features DARKER than their surroundings) and
// keeping the max of the two makes this brightness-agnostic: a white
// keyline and a black ink line are found the same way.
const OUTLINE_STROKE_RADIUS = 2; // px — flags features up to ~2*radius+1 px wide
const OUTLINE_TOPHAT_THRESHOLD = 50; // luminance units (0-255 scale)
// 2026-08-09: found live (Olga's ask, a real kitten illustration) — a
// single continuous keyline can have wildly different contrast along its
// own length, depending on what it happens to border: a white keyline
// against a dark grey fur stripe has a huge top-hat value (well above
// 50), the SAME line seconds later against pale cream fur has almost none
// (well below 50) — a single global threshold necessarily breaks the
// stroke into disconnected fragments wherever it crosses a low-contrast
// section, confirmed directly by rendering the raw top-hat magnitude as a
// heatmap: the whole outline is visible as a continuous signal, just with
// large brightness swings along it. Simply lowering the threshold
// globally isn't safe — 25 was already tried and rejected for a real
// regression (caught soft internal shading as false strokes, see
// OUTLINE_QUANTIZE_COLORS's history below). Fixed with hysteresis
// thresholding instead (the same two-threshold edge-linking technique
// Canny edge detection uses): OUTLINE_TOPHAT_THRESHOLD still gates which
// pixels can SEED a stroke (safe, unchanged, no new false positives on
// flat regions), but a lower threshold is now allowed to EXTEND an
// already-seeded stroke through low-contrast stretches, since a weak
// pixel only counts if it's connected to a real seed — isolated soft
// shading with no strong stroke nearby still never qualifies.
const OUTLINE_TOPHAT_LOW_THRESHOLD = 15; // luminance units — only reachable by growing from a real seed, see detectOutlineMask

// Some source PNGs carry subtle, structured pixel-level variation in
// otherwise visually-flat regions (compression-artifact-like, not simple
// noise — survives median filtering up to radius 7) that the top-hat above
// misreads as tiny outline candidates. Quantizing the full-resolution image
// to a coarse palette before edge detection collapses that variation into
// its dominant surrounding color, while a genuine stroke color — different
// enough from its surroundings to matter for the pattern — still earns its
// own cluster at this color count.
//
// 18 (the original estimate — coarse relative to the illustration's real
// palette, fine relative to the stitch grid) was tested against a real
// regression: a subtle, low-contrast stroke (the baby's eyebrow/eye in
// "Lady of Perpetual Love", the same feature OUTLINE_TOPHAT_THRESHOLD was
// tuned for) has a similar contrast magnitude to the noise this pass exists
// to remove, and at 18 clusters it lost the fight for cluster budget against
// the image's larger flat regions and got absorbed into the skin tone —
// smearing into a blur instead of the ~2-stitch dark patch it should be.
// Verified at 30: the eyebrow/eye survive intact again, and the puppy
// ear/leg noise this pass was built for stays fixed — enough headroom for a
// subtle-but-real stroke to keep its own cluster without giving back the
// noise suppression.
const OUTLINE_QUANTIZE_COLORS = 30;

// Separable min/max filter (exact for a square structuring element: a 2D
// min/max over a square equals a 1D min/max over rows then over columns).
function boxMinMax(src: Float32Array, w: number, h: number, radius: number, useMax: boolean): Float32Array {
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let best = useMax ? -Infinity : Infinity;
      const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius);
      for (let xx = x0; xx <= x1; xx++) {
        const v = src[row + xx];
        if (useMax ? v > best : v < best) best = v;
      }
      tmp[row + x] = best;
    }
  }
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let best = useMax ? -Infinity : Infinity;
      const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * w + x];
        if (useMax ? v > best : v < best) best = v;
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

function detectOutlineMask(data: Buffer, w: number, h: number): Uint8Array {
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  }
  const eroded = boxMinMax(lum, w, h, OUTLINE_STROKE_RADIUS, false);
  const opened = boxMinMax(eroded, w, h, OUTLINE_STROKE_RADIUS, true);
  const dilated = boxMinMax(lum, w, h, OUTLINE_STROKE_RADIUS, true);
  const closed = boxMinMax(dilated, w, h, OUTLINE_STROKE_RADIUS, false);
  const topHat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const whiteTopHat = lum[i] - opened[i];
    const blackTopHat = closed[i] - lum[i];
    topHat[i] = Math.max(whiteTopHat, blackTopHat);
  }

  // Hysteresis linking (Canny's technique): every strong (> HIGH) pixel is
  // a seed; from each seed, flood outward through 8-connected neighbors
  // that clear the LOWER threshold, so a genuine stroke's low-contrast
  // stretches get included via connectivity to a real seed, while
  // low-contrast noise with no strong seed anywhere nearby still never
  // qualifies on its own.
  const mask = new Uint8Array(n);
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (topHat[i] > OUTLINE_TOPHAT_THRESHOLD) { visited[i] = 1; mask[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (visited[j]) continue;
        if (topHat[j] > OUTLINE_TOPHAT_LOW_THRESHOLD) { visited[j] = 1; mask[j] = 1; stack.push(j); }
      }
    }
  }
  return mask;
}

// Maps the full-resolution outline mask down to the target stitch grid: a
// target cell is flagged if any source pixel in its corresponding block was
// flagged, and carries the AVERAGE color of just those flagged source
// pixels (not the whole block) — so the cell remembers the stroke's actual
// color (white, black, or anything else) rather than an assumed color.
function downsampleOutlineMask(mask: Uint8Array, data: Buffer, srcW: number, srcH: number, dstW: number, dstH: number): (Lab | null)[] {
  const out: (Lab | null)[] = new Array(dstW * dstH).fill(null);
  for (let ty = 0; ty < dstH; ty++) {
    const y0 = Math.floor((ty / dstH) * srcH);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) / dstH) * srcH));
    for (let tx = 0; tx < dstW; tx++) {
      const x0 = Math.floor((tx / dstW) * srcW);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) / dstW) * srcW));
      let sumL = 0, sumA = 0, sumB = 0, count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const si = sy * srcW + sx;
          if (!mask[si]) continue;
          const lab = rgbToLab(data[si * 3], data[si * 3 + 1], data[si * 3 + 2]);
          sumL += lab[0]; sumA += lab[1]; sumB += lab[2]; count++;
        }
      }
      if (count > 0) out[ty * dstW + tx] = [sumL / count, sumA / count, sumB / count];
    }
  }
  return out;
}

// A candidate cell from the full-resolution edge pass is only a genuine
// stroke/line — and not just an anti-aliased blend pixel along an ordinary
// region boundary, or noise/texture on the source art — if it's part of a
// connected group of at least 2 cells whose combined average color is
// clearly different from what normal clustering already assigned to the
// SETTLED (non-candidate) cells bordering that group.
//
// This deliberately judges connected candidates as a GROUP rather than
// pixel-by-pixel: two adjacent candidate cells that are both, say, part of
// the same dark eye-line would wrongly suppress each other under a
// pixel-by-pixel comparison (each reads as "close to" its neighbor, which
// is backwards — mutual agreement between candidates is evidence FOR a
// stroke). Grouping first and comparing the group's average against its
// true (non-candidate) surroundings avoids that, while a dense scatter of
// unrelated single-pixel noise still gets judged against its real
// neighbors and filtered out same as before. A group of exactly 1 cell is
// always dropped — this app never allows isolated single-stitch "confetti"
// (see removeConfetti on the client, same 8-neighbor connectivity rule).
const OUTLINE_DISTINCT_MIN_DIST2 = 300; // squared LAB distance (CIE76), ~17 deltaE

function resolveOutlineComponents(cells: (Lab | null)[], pixelDmc: number[], w: number, h: number, dist: (a: Lab, b: Lab) => number): (number | null)[] {
  const out: (number | null)[] = new Array(w * h).fill(null);
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!cells[start] || visited[start]) continue;
    const component: number[] = [];
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      component.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (!visited[ni] && cells[ni]) { visited[ni] = 1; stack.push(ni); }
        }
      }
    }
    if (component.length < 2) continue;

    let sumL = 0, sumA = 0, sumB = 0;
    for (const i of component) {
      const lab = cells[i]!;
      sumL += lab[0]; sumA += lab[1]; sumB += lab[2];
    }
    const avg: Lab = [sumL / component.length, sumA / component.length, sumB / component.length];

    const border = new Set<number>();
    for (const i of component) {
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (!cells[ni]) border.add(ni);
        }
      }
    }
    let minDist = Infinity;
    for (const ni of border) {
      const d = labDist2(avg, DMC_LAB[pixelDmc[ni]]);
      if (d < minDist) minDist = d;
    }
    if (minDist < OUTLINE_DISTINCT_MIN_DIST2) continue;

    const dmc = nearestDmcLab(avg, dist);

    // 2026-08-09 (real case: a mouse's whiskers): only force this
    // component to one uniform averaged color if plain per-cell
    // clustering (pixelDmc, already computed independently of any
    // outline candidate) genuinely never lands on this DMC anywhere in
    // the component on its own — i.e. the detail is truly invisible
    // without protection (a real low-contrast case, e.g. a white keyline
    // on white/cream background). If plain clustering ALREADY picked
    // this exact DMC for at least one cell here, the detail has enough
    // natural contrast to survive unprotected — skip the override and
    // let each cell's own independently-clustered answer stand. Verified
    // live: four whiskers close together were getting forced into one
    // dark blob by the override even though each cell's own plain
    // clustering already resolved several of them correctly on its own;
    // skipping the override there lets them render as the natural
    // dashed/partial look a thin high-contrast stroke gets at this
    // resolution, instead of one merged patch swallowing all four.
    const naturallyPresent = component.some(i => pixelDmc[i] === dmc);
    if (naturallyPresent) continue;

    for (const i of component) out[i] = dmc;
  }
  return out;
}

// EXPERIMENTAL (2026-08-10, not shipped): plain k-means minimizes total
// quantization error, not perceptual distinctness — two colors that are
// numerically close (e.g. a near-white subject on a near-white background,
// 16 LAB units apart) get pooled into ONE cluster even with a generous
// cluster budget, because splitting them barely reduces total error
// compared to giving a cluster to a more visually distinct color. Real
// case: a ghost illustration's entire body (a huge, spatially coherent
// region) vanished — same DMC as the true background, confirmed even
// after raising k-means' cluster budget for illustration mode didn't help.
// Fix: after clustering settles every cell's color, look at each color's
// actual cells as a shape — if they form 2+ large, separate connected
// components (not just scattered confetti), that's a sign color-only
// clustering conflated two real, different regions. Give every component
// past the largest its own DMC, computed from ITS OWN true average color
// (not the merged one) — same "push past maxColors for a good reason"
// exception the outline-preservation pass above already uses.
// v2: a blob that's genuinely touching its neighbor (no separating stroke —
// exactly the ghost-body-on-background case) forms ONE connected component
// even after being wrongly pooled into one DMC — there's no gap for
// connected-component analysis to find, because none exists in the pixel
// grid. Fix: instead of looking for spatial gaps, look for hidden color
// variation WITHIN the blob using each cell's real (pre-quantization) Lab
// value — run a local 2-means split restricted to just this blob's real
// colors, then only accept the split if the smaller side is both large
// enough AND spatially coherent (its own largest connected component
// covers most of it) — the latter check is what rejects a false-positive
// split on a blob that's genuinely one uniform color with only sensor/
// dithering noise, since noise splits scatter randomly rather than
// forming one region.
const LARGE_REGION_MIN_FRACTION = 0.02; // 2% of non-transparent pixels
const LARGE_REGION_MIN_ABSOLUTE = 40;   // px floor so tiny designs aren't exempt
const LARGE_REGION_COHERENCE_FRACTION = 0.6; // smaller side's largest component must cover this much of it

function avgLab(idxs: number[], pixelsLab: Lab[]): Lab {
  let sumL = 0, sumA = 0, sumB = 0;
  for (const i of idxs) { const l = pixelsLab[i]; sumL += l[0]; sumA += l[1]; sumB += l[2]; }
  return [sumL / idxs.length, sumA / idxs.length, sumB / idxs.length];
}

function largestConnectedComponentSize(idxs: number[], w: number, h: number): number {
  const set = new Set(idxs);
  const visited = new Set<number>();
  let largest = 0;
  for (const start of idxs) {
    if (visited.has(start)) continue;
    let size = 0;
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (visited.has(ni) || !set.has(ni)) continue;
          visited.add(ni);
          stack.push(ni);
        }
      }
    }
    if (size > largest) largest = size;
  }
  return largest;
}

// Connected components of `cells` (8-connected), regardless of color —
// used to check whether a DMC's pixels form 2+ genuinely separate spatial
// blobs (a real gap/stroke already divides them, e.g. a ghost design that
// DOES have a drawn outline between body and background) as opposed to one
// contiguous mass (no drawn separation at all, e.g. a ghost with none).
function connectedComponents(idxs: number[], w: number, h: number): number[][] {
  const set = new Set(idxs);
  const visited = new Set<number>();
  const comps: number[][] = [];
  for (const start of idxs) {
    if (visited.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (visited.has(ni) || !set.has(ni)) continue;
          visited.add(ni);
          stack.push(ni);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// Looks for hidden color variation within a single spatially-contiguous
// blob via a local 2-means split on the real (pre-quantization) Lab
// values — this is what recovers a case like a ghost whose body touches
// the background directly with no outline at all (so there's no spatial
// gap for connectedComponents to find; the only signal left is the faint
// real color difference). Returns the smaller side's cell list if a
// genuine split was found, else null. Requires the smaller side to be
// both large enough AND spatially coherent (its own largest connected
// component covers most of it) — that check is what rejects a
// false-positive split on a blob that's genuinely one uniform color with
// only sensor/dithering noise, since noise splits scatter randomly
// rather than forming one region.
function findHiddenColorSplit(
  cells: number[],
  pixelsLab: Lab[],
  w: number,
  h: number,
  dist: (a: Lab, b: Lab) => number,
  minSize: number,
): number[] | null {
  let seedA = cells[0], seedB = cells[0];
  let minL = Infinity, maxL = -Infinity;
  for (const i of cells) {
    const l = pixelsLab[i][0];
    if (l < minL) { minL = l; seedA = i; }
    if (l > maxL) { maxL = l; seedB = i; }
  }
  if (seedA === seedB) return null; // perfectly uniform blob, nothing hidden to find

  let centerA = pixelsLab[seedA];
  let centerB = pixelsLab[seedB];
  let groupA: number[] = [];
  let groupB: number[] = [];
  for (let iter = 0; iter < 6; iter++) {
    groupA = [];
    groupB = [];
    for (const i of cells) {
      const p = pixelsLab[i];
      if (dist(p, centerA) <= dist(p, centerB)) groupA.push(i); else groupB.push(i);
    }
    if (groupA.length === 0 || groupB.length === 0) break;
    centerA = avgLab(groupA, pixelsLab);
    centerB = avgLab(groupB, pixelsLab);
  }
  if (groupA.length === 0 || groupB.length === 0) return null;

  const minor = groupA.length <= groupB.length ? groupA : groupB;
  if (minor.length < minSize) return null;
  if (largestConnectedComponentSize(minor, w, h) < minor.length * LARGE_REGION_COHERENCE_FRACTION) return null;
  return minor;
}

function splitLargeMergedRegions(
  pixelDmc: number[],
  pixelsLab: Lab[],
  transparent: Uint8Array,
  w: number,
  h: number,
  dist: (a: Lab, b: Lab) => number,
): void {
  const n = w * h;
  let nonTransparent = 0;
  for (let i = 0; i < n; i++) if (!transparent[i]) nonTransparent++;
  const minSize = Math.max(LARGE_REGION_MIN_ABSOLUTE, Math.round(nonTransparent * LARGE_REGION_MIN_FRACTION));

  const byDmc = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (transparent[i]) continue;
    const dmc = pixelDmc[i];
    let arr = byDmc.get(dmc);
    if (!arr) { arr = []; byDmc.set(dmc, arr); }
    arr.push(i);
  }

  for (const [dmc, cells] of byDmc) {
    if (cells.length < minSize * 2) continue;

    // A real gap (e.g. a drawn outline stroke) may already separate two
    // or more large regions sharing this color — give every component
    // past the largest its own true-average color right away, since real
    // spatial separation is itself sufficient evidence they're different.
    const comps = connectedComponents(cells, w, h);
    comps.sort((a, b) => b.length - a.length);
    for (let ci = 1; ci < comps.length; ci++) {
      const comp = comps[ci];
      if (comp.length < minSize) continue;
      const newDmc = nearestDmcLab(avgLab(comp, pixelsLab), dist);
      if (newDmc === dmc) continue;
      for (const i of comp) pixelDmc[i] = newDmc;
    }

    // The largest component is never split by the pass above — but being
    // largest doesn't mean it's genuinely one region: a ghost whose body
    // touches the background directly (no outline, no gap at all) forms
    // ONE component that IS the false merge. Always also check it for
    // hidden color variation.
    const largest = comps[0];
    if (largest.length < minSize * 2) continue;
    const minor = findHiddenColorSplit(largest, pixelsLab, w, h, dist, minSize);
    if (!minor) continue;
    const minorAvg = avgLab(minor, pixelsLab);
    let newDmc = nearestDmcLab(minorAvg, dist);
    if (newDmc === dmc) newDmc = nearestDmcLabExcluding(minorAvg, dist, dmc);
    for (const i of minor) pixelDmc[i] = newDmc;
  }
}

// 2026-08-09 (Olga's ask, real live case): line-art source images
// (AI-generated or otherwise) commonly have anti-aliased grey pixels
// along the stroke's edges — a real saved draft ended up with 7 distinct
// grey DMC entries from this alone. For a true line-art design these
// aren't meaningful colors, just soft-edge artifacts of the line and the
// background meeting; snap anything grayscale (low saturation — real
// accent colors like the turquoise eye/gold earring in that same design
// stay far more saturated than this) to whichever pure endpoint (black
// ink or white background) it's closer to in lightness. Only applied in
// line-art mode — a real illustration/photo can have legitimate grey
// content (a cat's fur, a stone wall) that must NOT be forced to black
// or white.
const GRAYSCALE_SATURATION_THRESHOLD = 20;

function nearestPureDmcIndex(target: 0 | 255): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < DMC.length; i++) {
    const c = DMC[i];
    const d = (c.r - target) ** 2 + (c.g - target) ** 2 + (c.b - target) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function mergeGrayscaleTowardBlackWhite(pixelDmc: number[], transparent: Uint8Array): void {
  const blackIdx = nearestPureDmcIndex(0);
  const whiteIdx = nearestPureDmcIndex(255);
  for (let i = 0; i < pixelDmc.length; i++) {
    if (transparent[i]) continue;
    const c = DMC[pixelDmc[i]];
    const saturation = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    if (saturation >= GRAYSCALE_SATURATION_THRESHOLD) continue;
    const lightness = (c.r + c.g + c.b) / 3;
    pixelDmc[i] = lightness < 128 ? blackIdx : whiteIdx;
  }
}

// ── Main converter ───────────────────────────────────────────────────────────

export async function convertImage(
  imageBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  maxColors: number,
  mode: ConversionMode = 'photo',
  colorDistanceMode: ColorDistanceMode = 'cie76',
): Promise<ConvertedPattern> {
  const { clusterDist, finalDist } = makeDistanceFns(colorDistanceMode);
  const isFlatArtMode = mode === 'line-art' || mode === 'illustration';
  const { data, transparent, width: w, height: h } = await decodeComposited(
    isFlatArtMode
      ? sharp(imageBuffer).resize(targetWidth, targetHeight, { fit: 'fill', kernel: 'nearest' })
      : sharp(imageBuffer).resize(targetWidth, targetHeight, { fit: 'fill' })
  );
  const n = w * h;

  // Seed the PRNG from the raw file bytes so the same image always produces
  // the same output regardless of how many times it's run. Created up front
  // so both the outline-detection quantization pass below and the main
  // clustering draw from the same deterministic stream.
  const rand = makePrng(seedFromBuffer(imageBuffer));

  // Outline strokes need to be found before any resizing blurs/skips them —
  // decode the source at its own native resolution separately for this.
  // Deliberately over-inclusive at this stage (see detectOutlineMask); the
  // real stroke/not-a-stroke decision happens after clustering below, via
  // resolveOutlineComponents.
  let outlineCandidates: (Lab | null)[] | null = null;
  if (isFlatArtMode) {
    const full = await decodeComposited(sharp(imageBuffer));
    const fullN = full.width * full.height;
    const fullLab: Lab[] = new Array(fullN);
    for (let i = 0; i < fullN; i++)
      fullLab[i] = rgbToLab(full.data[i * 3], full.data[i * 3 + 1], full.data[i * 3 + 2]);

    // Quantize a copy of the full-resolution source before edge detection
    // (see OUTLINE_QUANTIZE_COLORS) — detection runs on the quantized copy,
    // but downsampleOutlineMask below still samples color from the
    // ORIGINAL full.data, so a preserved stroke keeps its true source color.
    const fullSample = buildSample(fullLab, rand);
    const { centroids: qCentroids, assignments: qAssignments } =
      kmeansQuantize(fullLab, fullSample, OUTLINE_QUANTIZE_COLORS, rand, clusterDist);
    const centroidRgb = qCentroids.map(labToRgb);
    const quantized = Buffer.alloc(fullN * 3);
    for (let i = 0; i < fullN; i++) {
      const [r, g, b] = centroidRgb[qAssignments[i]];
      quantized[i * 3] = r; quantized[i * 3 + 1] = g; quantized[i * 3 + 2] = b;
    }

    const fullMask = detectOutlineMask(quantized, full.width, full.height);
    outlineCandidates = downsampleOutlineMask(fullMask, full.data, full.width, full.height, w, h);
  }

  // Convert all pixels to LAB
  const pixelsLab: Lab[] = new Array(n);
  for (let i = 0; i < n; i++)
    pixelsLab[i] = rgbToLab(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);

  // Photo mode: overshoot k so rare-colour regions get dedicated cluster slots, then trim.
  // Line-art mode: use exact k — overshoot creates spurious intermediate colours on flat art.
  // Transparent (background) pixels are excluded from the sample so they
  // don't spend cluster budget on a color that will end up discarded anyway
  // (see the transparent-exclusion in the tally below) — falls back to the
  // full pixel set only in the degenerate case of a fully-transparent image.
  const opaquePixelsLab = pixelsLab.filter((_, i) => !transparent[i]);
  const sample = buildSample(opaquePixelsLab.length > 0 ? opaquePixelsLab : pixelsLab, rand);
  const kOver = (mode === 'line-art' || mode === 'illustration')
    ? Math.min(maxColors, sample.length)
    : Math.min(Math.round(maxColors * KMEANS_OVERSHOOT), sample.length);
  const { centroids, assignments } = kmeansLab(pixelsLab, sample, kOver, rand, clusterDist);

  // Snap each centroid to nearest DMC color
  const centroidDmc: number[] = centroids.map(c => nearestDmcLab(c, finalDist));

  // Tally pixel count per centroid, then per DMC color — excluding
  // transparent pixels, so a real alpha-transparent background never
  // competes for a maxColors slot (it becomes an empty stitch, not a
  // "white" thread color — see the grid-building step below).
  const centroidPx = new Int32Array(centroids.length);
  for (let i = 0; i < n; i++) if (!transparent[i]) centroidPx[assignments[i]]++;

  const dmcPx = new Map<number, number>();
  for (let ci = 0; ci < centroids.length; ci++)
    if (centroidPx[ci] > 0)
      dmcPx.set(centroidDmc[ci], (dmcPx.get(centroidDmc[ci]) ?? 0) + centroidPx[ci]);

  // Keep top maxColors DMC entries by pixel count
  const keepDmc = new Set(
    [...dmcPx.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors).map(([d]) => d)
  );

  // Remap dropped centroids to nearest kept centroid (in LAB space) — this
  // decides which surviving DMC color absorbs an under-represented cluster,
  // so it's a "final" user-visible color decision, not an internal
  // clustering detail.
  const centroidFinal = centroidDmc.map((d, ci) => {
    if (keepDmc.has(d)) return d;
    let best = d, bestDist = Infinity;
    for (let cj = 0; cj < centroids.length; cj++) {
      if (!keepDmc.has(centroidDmc[cj])) continue;
      const dd = finalDist(centroids[ci], centroids[cj]);
      if (dd < bestDist) { bestDist = dd; best = centroidDmc[cj]; }
    }
    return best;
  });

  // Map each pixel to its final DMC color (guaranteed ≤ maxColors distinct values)
  const pixelDmc: number[] = Array.from(assignments, j => centroidFinal[j]);

  if (mode === 'illustration' || mode === 'line-art') {
    splitLargeMergedRegions(pixelDmc, pixelsLab, transparent, w, h, finalDist);
  }

  // Now that clustering has settled every cell's color, decide which edge
  // candidates are genuine strokes (resolveOutlineComponents) and force the
  // survivors onto the DMC color nearest their OWN sampled color (white
  // keyline, black ink, a colored highlight — whatever it actually is, not
  // an assumed white), bypassing the pixel-count trim above entirely — this
  // can push the final palette a few colors past maxColors, a deliberate,
  // minor exception to keep the illustration's separating strokes and fine
  // linework intact.
  if (outlineCandidates) {
    const outlineDmc = resolveOutlineComponents(outlineCandidates, pixelDmc, w, h, finalDist);
    for (let i = 0; i < n; i++) {
      const dmc = outlineDmc[i];
      if (dmc !== null) pixelDmc[i] = dmc;
    }
  }

  if (mode === 'line-art') mergeGrayscaleTowardBlackWhite(pixelDmc, transparent);

  // Build compact palette — excluding transparent (background) pixels, so a
  // real alpha-transparent background never becomes a spurious "white"
  // color entry with cells that will all be blanked below anyway.
  const uniqueDmc = Array.from(new Set(pixelDmc.filter((_, i) => !transparent[i])));
  const dmcToIdx = new Map(uniqueDmc.map((dmc, i) => [dmc, i]));

  // Count stitches per color (transparent positions never enter this tally)
  const stitchCounts = new Array(uniqueDmc.length).fill(0);
  for (let i = 0; i < n; i++) {
    if (transparent[i]) continue;
    stitchCounts[dmcToIdx.get(pixelDmc[i])!]++;
  }

  // Sort palette by stitch count desc, assign symbols
  const palette: PatternPalette[] = uniqueDmc
    .map((dmcIdx, i) => ({ ...DMC[dmcIdx], symbol: '', stitchCount: stitchCounts[i] }))
    .sort((a, b) => b.stitchCount - a.stitchCount);
  palette.forEach((p, i) => { p.symbol = symbolForIndex(i); });

  // Remap grid indices to sorted palette order; a transparent source pixel
  // becomes an empty stitch (-1) — the same sentinel the editor already
  // uses for erased/empty cells everywhere else — instead of a color.
  const numberToNew = new Map(palette.map((p, ni) => [p.number, ni]));
  const grid: number[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const i = y * w + x;
      if (transparent[i]) return -1;
      return numberToNew.get(DMC[pixelDmc[i]].number) ?? 0;
    })
  );

  return { grid, palette, width: w, height: h };
}
