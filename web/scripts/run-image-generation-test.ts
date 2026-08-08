// Manual test: generate an image through both candidate providers, save
// each PNG to the scratchpad so it can actually be viewed. Real per-image
// billing, run deliberately.
import { writeFileSync } from 'fs';
import { generateImageStability, generateImageOpenAI, pickStabilityAspectRatio, pickOpenAiSize } from '../src/lib/image-generation';

// Rewritten by hand 2026-08-07 per Olga's feedback on the first version
// (busy pond scene, capybara too small) — a subject portrait instead of
// a scene, matching the corrected buildPrompt() guidance in
// trend-detection.ts. Not re-run through detectTrend() itself (that
// would cost another real web_search call for the same already-found
// theme) — just testing the corrected composition on the same theme.
const PROMPT =
  'A single plump, round capybara, shown large and centered, filling almost the entire frame, in a cute flat kawaii illustration style with bold clean dark outlines and soft rounded shapes, sitting with a content closed-eye smile, on a SOLID FLAT WHITE background — no vignette, no gradient, no glow, no shadow, no circular badge or frame or border, no texture or grain, no ground, no grass, no props of any kind. Just the capybara itself on plain solid white, like a die-cut sticker.';

const OUT_DIR = process.argv[2];
// Optional: detectTrend()'s researched targetWidth/targetHeight (2026-08-08
// addition) — when given, each provider generates at its closest supported
// aspect ratio/size instead of always defaulting to square. Omit both to
// keep the original square-only behavior.
const TARGET_WIDTH = process.argv[3] ? Number(process.argv[3]) : undefined;
const TARGET_HEIGHT = process.argv[4] ? Number(process.argv[4]) : undefined;

if (!OUT_DIR) {
  console.error('Usage: run-image-generation-test.ts <output-dir> [targetWidth] [targetHeight]');
  process.exit(1);
}

function save(name: string, pngBase64: string, model: string) {
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(pngBase64, 'base64'));
  console.log(`${name}: OK -> ${path} (model=${model})`);
}

async function main() {
  const stabilityRatio = TARGET_WIDTH && TARGET_HEIGHT ? pickStabilityAspectRatio(TARGET_WIDTH, TARGET_HEIGHT) : '1:1';
  const openAiSize = TARGET_WIDTH && TARGET_HEIGHT ? pickOpenAiSize(TARGET_WIDTH, TARGET_HEIGHT) : '1024x1024';
  if (TARGET_WIDTH && TARGET_HEIGHT) {
    console.log(`Requesting non-square: stability=${stabilityRatio}, openai=${openAiSize} (from target ${TARGET_WIDTH}x${TARGET_HEIGHT})`);
  }

  try {
    const r = await generateImageStability(PROMPT, stabilityRatio);
    save('stability', r.pngBase64, r.model);
  } catch (e) {
    console.error('stability: FAILED -', e instanceof Error ? e.message : e);
  }

  try {
    const r = await generateImageOpenAI(PROMPT, openAiSize);
    save('openai', r.pngBase64, r.model);
  } catch (e) {
    console.error('openai: FAILED -', e instanceof Error ? e.message : e);
  }
}
main();
