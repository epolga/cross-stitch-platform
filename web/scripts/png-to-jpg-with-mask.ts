// Ad-hoc PNG→JPG conversion for Olga (session requests) — uses the same
// splitPngForStorage() the site's own upload path uses (convert/route.ts),
// so a manual conversion never drifts from what production does. Original
// PNG is always left untouched; writes <name>.jpg next to it, plus
// <name>.mask.png only if the source PNG had real (non-fully-opaque) alpha.
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { splitPngForStorage } from '../src/lib/png-jpg-mask';

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npx tsx scripts/png-to-jpg-with-mask.ts <file.png>');
    process.exit(2);
  }

  const buffer = readFileSync(input);
  const { rgbJpeg, maskPng } = await splitPngForStorage(buffer);

  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  const jpgPath = path.join(dir, `${base}.jpg`);
  writeFileSync(jpgPath, rgbJpeg);
  console.log(`Wrote ${jpgPath} (${rgbJpeg.length} bytes)`);

  if (maskPng) {
    const maskPath = path.join(dir, `${base}.mask.png`);
    writeFileSync(maskPath, maskPng);
    console.log(`Wrote ${maskPath} (${maskPng.length} bytes) — source had real transparency`);
  } else {
    console.log('No real transparency detected — no mask written');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
