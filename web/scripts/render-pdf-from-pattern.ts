// Throwaway helper: feeds a pattern JSON (from extract-catalog-pattern.ts)
// through the real /api/convert/pdf route handler — same code path the site
// uses — without needing a running dev server, so the actual generated PDF
// can be inspected directly.
import { writeFileSync, readFileSync } from 'fs';
import { POST } from '../src/app/api/convert/pdf/route';

async function main() {
  const file = process.argv[2];
  const outFile = process.argv[3] || 'out.pdf';
  const chartMode = process.argv[4] || 'symbol';
  const author = process.argv[5] || null;
  if (!file) {
    console.error('Usage: npx tsx scripts/render-pdf-from-pattern.ts <patternJson> [outFile] [chartMode] [author]');
    process.exit(2);
  }
  const pattern = JSON.parse(readFileSync(file, 'utf8'));

  const fakeRequest = {
    json: async () => ({
      grid: pattern.grid,
      palette: pattern.palette,
      title: pattern.title || 'Cross-Stitch Pattern',
      author,
      chartMode,
    }),
  } as unknown as Parameters<typeof POST>[0];

  const response = await POST(fakeRequest);
  if (response.status !== 200) {
    console.error('PDF generation failed:', response.status, await response.text());
    process.exit(1);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  writeFileSync(outFile, buf);
  console.log(`Wrote ${outFile} (${buf.length} bytes)`);
}

main().catch(err => { console.error(err); process.exit(1); });
