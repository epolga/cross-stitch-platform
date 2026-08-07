// Manual test: strip the background from an already-generated image via
// Stability's dedicated remove-background tool.
import { readFileSync, writeFileSync } from 'fs';
import { removeBackgroundStability } from '../src/lib/image-generation';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: run-remove-background-test.ts <input.png> <output.png>');
  process.exit(1);
}

async function main() {
  const pngBase64 = readFileSync(inputPath).toString('base64');
  const result = await removeBackgroundStability(pngBase64);
  writeFileSync(outputPath, Buffer.from(result.pngBase64, 'base64'));
  console.log(`OK -> ${outputPath} (model=${result.model})`);
}
main().catch((e) => {
  console.error('FAILED -', e instanceof Error ? e.message : e);
  process.exit(1);
});
