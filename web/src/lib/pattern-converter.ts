import sharp from 'sharp';
import dmcColors from '@/data/dmc-colors.json';

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

// Cross-stitch symbols ordered by visual distinctiveness at small cell sizes.
// Geometric shapes first — assigned to the most-used colors.
const SYMBOLS = [
  // Solid shapes (most visually heavy — best at small sizes)
  '■', '▲', '▼', '◆', '●', '★', '▪', '▶', '◀',
  // Outline shapes
  '□', '△', '▽', '◇', '○', '☆', '▫',
  // Circled / boxed
  '⊕', '⊗', '⊙', '⊞', '⊠', '⊡',
  // Plus / cross family
  '+', '×', '✚', '✛',
  // Arrows
  '↑', '↓', '←', '→', '↔', '↕', '↗', '↘', '↙', '↖',
  // Math / set operators
  '÷', '=', '≠', '≡', '∅', '∞', '∧', '∨', '∩', '∪', '∇', '∗', '≈', '±',
  // Lines / slashes
  '|', '‖', '/', '\\', '¬',
  // Greek letters (distinct from Latin)
  'Σ', 'Δ', 'Λ', 'Φ', 'Ψ', 'Ω', 'λ', 'μ',
  // Latin uppercase / lowercase (fallback for large palettes)
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  // ASCII misc
  '!', '#', '$', '%', '&', '<', '>', '?', '@', '^', '~', ':', ';', '*', '-', '·',
];

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

function nearestDmc(r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < DMC.length; i++) {
    const d = colorDist(r, g, b, DMC[i].r, DMC[i].g, DMC[i].b);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Merge the smallest-count color cluster into its nearest neighbour until palette ≤ maxColors
function reducePalette(grid: number[][], indexMap: number[], maxColors: number): number[] {
  // indexMap[gridValue] = DMC index; returns new indexMap
  const map = [...indexMap];

  while (true) {
    // Count frequency
    const freq = new Map<number, number>();
    for (const row of grid) {
      for (const v of row) {
        const dmc = map[v];
        freq.set(dmc, (freq.get(dmc) ?? 0) + 1);
      }
    }
    const unique = Array.from(freq.keys());
    if (unique.length <= maxColors) break;

    // Find rarest
    let rarest = unique[0];
    let rarestCount = freq.get(rarest)!;
    for (const k of unique) {
      if (freq.get(k)! < rarestCount) { rarest = k; rarestCount = freq.get(k)!; }
    }

    // Find nearest other unique color
    const rc = DMC[rarest];
    let nearest = -1;
    let nearestDist = Infinity;
    for (const k of unique) {
      if (k === rarest) continue;
      const d = colorDist(rc.r, rc.g, rc.b, DMC[k].r, DMC[k].g, DMC[k].b);
      if (d < nearestDist) { nearestDist = d; nearest = k; }
    }

    // Remap all occurrences of rarest → nearest
    for (let i = 0; i < map.length; i++) {
      if (map[i] === rarest) map[i] = nearest;
    }
  }

  return map;
}

export async function convertImage(
  imageBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  maxColors: number,
): Promise<ConvertedPattern> {
  // Resize to stitch grid
  const { data, info } = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // Map each pixel → DMC index
  const rawIndices: number[] = new Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    rawIndices[i] = nearestDmc(r, g, b);
  }

  // Collect unique DMC indices used
  const uniqueSet = new Set(rawIndices);
  const uniqueList = Array.from(uniqueSet);

  // indexMap: pixel value (0..uniqueList.length-1) → DMC array index
  const pixelToDmc = new Map(uniqueList.map((dmc, i) => [dmc, i]));
  const indexMap: number[] = uniqueList; // indexMap[i] = DMC index

  // Build grid using compact indices
  const flatGrid: number[] = rawIndices.map(dmc => pixelToDmc.get(dmc)!);

  // Reduce palette
  const reducedMap = reducePalette(
    Array.from({ length: h }, (_, y) => flatGrid.slice(y * w, (y + 1) * w)),
    indexMap,
    maxColors,
  );

  // Remap to final compact indices
  const finalDmcSet = new Set(reducedMap);
  const finalDmcList = Array.from(finalDmcSet);
  const dmcToFinal = new Map(finalDmcList.map((dmc, i) => [dmc, i]));
  const finalIndexMap: number[] = flatGrid.map(v => dmcToFinal.get(reducedMap[v])!);

  // Build 2D grid
  const grid: number[][] = Array.from({ length: h }, (_, y) =>
    finalIndexMap.slice(y * w, (y + 1) * w)
  );

  // Count stitches per color
  const stitchCounts = new Array(finalDmcList.length).fill(0);
  for (const v of finalIndexMap) stitchCounts[v]++;

  // Build palette sorted by stitch count desc
  const paletteUnsorted: PatternPalette[] = finalDmcList.map((dmcIdx, i) => ({
    ...DMC[dmcIdx],
    symbol: '',
    stitchCount: stitchCounts[i],
  }));
  paletteUnsorted.sort((a, b) => b.stitchCount - a.stitchCount);
  paletteUnsorted.forEach((p, i) => { p.symbol = SYMBOLS[i] ?? '?'; });

  // Remap grid to sorted palette order
  const oldToNew = new Map(paletteUnsorted.map((p, newIdx) => {
    const oldIdx = finalDmcList.findIndex(di => DMC[di].number === p.number);
    return [oldIdx, newIdx];
  }));
  const sortedGrid = grid.map(row => row.map(v => oldToNew.get(v) ?? v));

  return { grid: sortedGrid, palette: paletteUnsorted, width: w, height: h };
}
