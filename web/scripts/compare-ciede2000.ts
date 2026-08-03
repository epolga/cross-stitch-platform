// Throwaway comparison helper for Focus.md Open item #11 (CIE76 vs
// CIEDE2000 DMC color matching). Runs convertImage() three ways on the same
// image — the current CIE76-everywhere baseline, CIEDE2000 only at the
// final DMC-snap step, and CIEDE2000 everywhere including k-means
// clustering — and reports timing plus how the resulting DMC palettes
// differ, so the accuracy/speed tradeoff can be judged from real output
// instead of guessing.
import { readFileSync, writeFileSync } from 'fs';
import { createCanvas } from '@napi-rs/canvas';
import { convertImage, type ColorDistanceMode, type ConvertedPattern } from '../src/lib/pattern-converter';

const MODES: ColorDistanceMode[] = ['cie76', 'final-only', 'everywhere'];

function renderPreview(pattern: ConvertedPattern, outFile: string, cellSize = 6) {
  const { grid, palette, width, height } = pattern;
  const canvas = createCanvas(width * cellSize, height * cellSize);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#f5f0eb';
  ctx.fillRect(0, 0, width * cellSize, height * cellSize);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ci = grid[r][c];
      if (ci < 0 || ci >= palette.length) continue;
      const p = palette[ci];
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }
  writeFileSync(outFile, canvas.toBuffer('image/png'));
}

async function main() {
  const file = process.argv[2] || 'public/sample-photo.jpg';
  const outPrefix = process.argv[3] || 'ciede2000-compare';
  const targetWidth = parseInt(process.argv[4] || '80', 10);
  const targetHeight = parseInt(process.argv[5] || '80', 10);
  const maxColors = parseInt(process.argv[6] || '30', 10);

  console.log(`Image: ${file} | ${targetWidth}x${targetHeight}, up to ${maxColors} colors\n`);

  const imageBuffer = readFileSync(file);
  const results: Record<ColorDistanceMode, { pattern: ConvertedPattern; ms: number }> = {} as never;

  for (const mode of MODES) {
    const t0 = performance.now();
    const pattern = await convertImage(imageBuffer, targetWidth, targetHeight, maxColors, 'photo', mode);
    const ms = performance.now() - t0;
    results[mode] = { pattern, ms };
    renderPreview(pattern, `${outPrefix}-${mode}.png`);
  }

  console.log('Timing:');
  for (const mode of MODES) {
    console.log(`  ${mode.padEnd(11)} ${results[mode].ms.toFixed(0)}ms`);
  }

  console.log('\nPalettes (DMC number: stitch count), sorted by stitch count:');
  for (const mode of MODES) {
    const summary = results[mode].pattern.palette
      .map(p => `${p.number}(${p.stitchCount})`)
      .join(', ');
    console.log(`  ${mode}:\n    ${summary}`);
  }

  // Pixel-level agreement between cie76 baseline and each CIEDE2000 variant
  const baseline = results['cie76'].pattern;
  for (const mode of ['final-only', 'everywhere'] as ColorDistanceMode[]) {
    const candidate = results[mode].pattern;
    let differing = 0;
    let total = 0;
    for (let r = 0; r < baseline.grid.length; r++) {
      for (let c = 0; c < baseline.grid[r].length; c++) {
        total++;
        const baseDmc = baseline.palette[baseline.grid[r][c]]?.number;
        const candDmc = candidate.palette[candidate.grid[r]?.[c] ?? -1]?.number;
        if (baseDmc !== candDmc) differing++;
      }
    }
    console.log(`\ncie76 vs ${mode}: ${differing}/${total} cells (${((differing / total) * 100).toFixed(1)}%) landed on a different DMC color`);
  }

  console.log(`\nWrote ${outPrefix}-{${MODES.join(',')}}.png for visual comparison`);
}

main().catch(err => { console.error(err); process.exit(1); });
