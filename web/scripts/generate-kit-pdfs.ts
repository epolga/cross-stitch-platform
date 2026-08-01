// Generates the three catalog "kit" PDF variants (1/3/5) for one design from
// a single source PDF, using our own reverse-parser + chart renderer — this
// replaces the old workflow where an operator hand-prepared three separate
// density variants in the external chart program. Invoked by Uploader /
// UploaderCli as an external process, the same way Converter.exe already is
// (see docs/integration/pdf-structure.md and RunFullUploadFlowAsync).
//
// Variant meaning changed from "print density" to "chart display mode":
//   1.pdf = color + symbol   3.pdf = symbol only   5.pdf = color only
// The 1/3/5 filenames and S3 key slots are unchanged on purpose, so nothing
// downstream (RequiredPdfVariants, DownloadPdfLink.tsx, the missing-PDF
// audit) needs to change — only what's generated into those slots does.
//
// Also writes pattern.json (the same grid+palette shape
// batch-extract-catalog-patterns.ts produces) into outputDir. The old
// post-publish step re-fetched and re-parsed the just-uploaded kit PDF to
// get this — broken now, since our own generated PDF doesn't have the
// external chart program's "Cat No." color-key page layout the parser
// expects. We already have the parsed pattern right here, so save it
// directly; see stamp-editor-pattern.ts for the upload+DDB-stamp half.
//
// Usage:
//   npx tsx scripts/generate-kit-pdfs.ts <sourcePdf> <outputDir> [title]
//
// Prints "ok=1" as the last line on success (the caller checks for this,
// same convention as batch-extract-catalog-patterns.ts); exits non-zero and
// prints the error to stderr on failure.
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { extractPatternFromPdf } from '../src/lib/pdf-pattern-extractor';
import { POST } from '../src/app/api/convert/pdf/route';

async function render(
  grid: number[][],
  palette: unknown,
  title: string,
  chartMode: string,
  outFile: string,
): Promise<void> {
  const fakeRequest = {
    json: async () => ({ grid, palette, title, author: null, chartMode }),
  } as unknown as Parameters<typeof POST>[0];
  const response = await POST(fakeRequest);
  if (response.status !== 200) {
    throw new Error(`PDF generation failed (chartMode=${chartMode}): ${response.status} ${await response.text()}`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  writeFileSync(outFile, buf);
  console.log(`Wrote ${outFile} (${buf.length} bytes)`);
}

async function main() {
  const srcFile = process.argv[2];
  const outDir = process.argv[3];
  const title = process.argv[4] || path.basename(srcFile ?? '', path.extname(srcFile ?? '')) || 'Cross-Stitch Pattern';

  if (!srcFile || !outDir) {
    console.error('Usage: npx tsx scripts/generate-kit-pdfs.ts <sourcePdf> <outputDir> [title]');
    process.exit(2);
  }

  const bytes = readFileSync(srcFile);
  console.log(`Read ${srcFile} (${bytes.length} bytes)`);

  const { pattern, warnings } = extractPatternFromPdf(bytes);
  console.log(`Extracted ${pattern.width}x${pattern.height} stitches, ${pattern.palette.length} colors`);
  for (const w of warnings) console.log('warning: ' + w);

  await render(pattern.grid, pattern.palette, title, 'color-symbol', path.join(outDir, '1.pdf'));
  await render(pattern.grid, pattern.palette, title, 'symbol', path.join(outDir, '3.pdf'));
  await render(pattern.grid, pattern.palette, title, 'color', path.join(outDir, '5.pdf'));

  const patternJsonPath = path.join(outDir, 'pattern.json');
  writeFileSync(patternJsonPath, JSON.stringify(pattern));
  console.log(`Wrote ${patternJsonPath}`);

  console.log('ok=1');
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
