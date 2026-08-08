// Manual test: generate an image through both candidate providers, save
// each PNG to the scratchpad so it can actually be viewed. Real per-image
// billing, run deliberately.
//
// Generalized 2026-08-08 — previously hardcoded to a single frozen capybara
// test prompt (kept testing the same theme run after run). Now reads
// theme/imagePrompt/targetWidth/targetHeight straight from a real
// trend-detection result JSON — the exact shape run-trend-detection.ts
// prints to stdout — so this can be run against whatever theme was
// actually just found, end-to-end, not a fixture.
import { readFileSync, writeFileSync } from 'fs';
import { generateImageStability, generateImageOpenAI, pickStabilityAspectRatio, pickOpenAiSize } from '../src/lib/image-generation';

const OUT_DIR = process.argv[2];
const TREND_JSON_PATH = process.argv[3];

if (!OUT_DIR || !TREND_JSON_PATH) {
  console.error('Usage: run-image-generation-test.ts <output-dir> <trend-result.json>');
  console.error('  <trend-result.json> is the JSON object run-trend-detection.ts prints to stdout.');
  process.exit(1);
}

interface TrendResultShape {
  theme: string;
  imagePrompt: string;
  targetWidth?: number;
  targetHeight?: number;
}

function save(name: string, pngBase64: string, model: string) {
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(pngBase64, 'base64'));
  console.log(`${name}: OK -> ${path} (model=${model})`);
}

async function main() {
  const trend = JSON.parse(readFileSync(TREND_JSON_PATH, 'utf-8')) as TrendResultShape;
  const { theme, imagePrompt, targetWidth, targetHeight } = trend;
  console.log(`Theme: "${theme}"`);

  const stabilityRatio = targetWidth && targetHeight ? pickStabilityAspectRatio(targetWidth, targetHeight) : '1:1';
  const openAiSize = targetWidth && targetHeight ? pickOpenAiSize(targetWidth, targetHeight) : '1024x1024';
  if (targetWidth && targetHeight) {
    console.log(`Requesting: stability=${stabilityRatio}, openai=${openAiSize} (from researched target ${targetWidth}x${targetHeight})`);
  }

  try {
    const r = await generateImageStability(imagePrompt, stabilityRatio);
    save('stability', r.pngBase64, r.model);
  } catch (e) {
    console.error('stability: FAILED -', e instanceof Error ? e.message : e);
  }

  try {
    const r = await generateImageOpenAI(imagePrompt, openAiSize);
    save('openai', r.pngBase64, r.model);
  } catch (e) {
    console.error('openai: FAILED -', e instanceof Error ? e.message : e);
  }
}
main();
