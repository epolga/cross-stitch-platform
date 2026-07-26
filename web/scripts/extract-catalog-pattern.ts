// Fetches a catalog design's published kit PDF and reverse-parses it into the
// same grid+palette JSON the photo-to-cross-stitch editor uses, so an
// existing catalog design can eventually be opened and customized like a
// user's own converted photo.
//
// Usage:
//   npx tsx scripts/extract-catalog-pattern.ts <designId> [outFile]
//
// See docs/plan/web/Catalog PDF-to-Editable Conversion — Feasibility
// Findings.md for the background, and src/lib/pdf-pattern-extractor.ts for
// the actual parsing logic.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { writeFileSync } from 'fs';
import { extractPatternFromPdf } from '../src/lib/pdf-pattern-extractor';

const PDF_BASE = 'https://d2o1uvvg91z7o4.cloudfront.net/pdfs';

async function main() {
  const designId = parseInt(process.argv[2], 10);
  if (!designId) {
    console.error('Usage: npx tsx scripts/extract-catalog-pattern.ts <designId> [outFile]');
    process.exit(2);
  }
  const outFile = process.argv[3] || `pattern-${designId}.json`;

  const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const doc = DynamoDBDocumentClient.from(client);
  const res = await doc.send(new QueryCommand({
    TableName: 'CrossStitchItems',
    IndexName: 'DesignsByID-index',
    KeyConditionExpression: 'EntityType = :e AND DesignID = :d',
    ExpressionAttributeValues: { ':e': 'DESIGN', ':d': designId },
  }));
  const design = res.Items?.[0];
  if (!design) {
    console.error(`Design ${designId} not found in CrossStitchItems`);
    process.exit(1);
  }
  console.log(`Design ${designId}: "${design.Caption}" (AlbumID ${design.AlbumID}, ${design.Width}x${design.Height} in DB, ${design.NColors} colors)`);

  const pdfUrl = `${PDF_BASE}/${design.AlbumID}/Stitch${designId}_Kit.pdf`;
  console.log(`Fetching ${pdfUrl} ...`);
  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) {
    console.error(`Failed to fetch PDF: HTTP ${pdfRes.status}`);
    process.exit(1);
  }
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  console.log(`Downloaded ${pdfBytes.length} bytes`);

  const { pattern, warnings } = extractPatternFromPdf(pdfBytes);

  console.log(`Reconstructed: ${pattern.width}x${pattern.height} stitches, ${pattern.palette.length} colors`);
  if (warnings.length) {
    console.log('Warnings:');
    for (const w of warnings) console.log('  - ' + w);
  } else {
    console.log('No warnings.');
  }

  writeFileSync(outFile, JSON.stringify({ ...pattern, title: design.Caption }));
  console.log(`Wrote ${outFile}`);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
