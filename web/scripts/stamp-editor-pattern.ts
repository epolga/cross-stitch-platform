// Uploads a locally-parsed pattern JSON (produced by generate-kit-pdfs.ts,
// right after generation, from the same in-memory extraction — no re-fetch
// or re-parse of the just-uploaded kit PDF, unlike the old post-publish
// step this replaces) to the private cross-stitch-editor-designs bucket and
// stamps EditorPatternKey (+LastModifiedAt) on the design's DynamoDB row, so
// "Open in editor" is live immediately after a new design is published via
// Uploader/UploaderCli. Mirrors the upload+stamp half of
// batch-extract-catalog-patterns.ts's processOne(); the extraction half is
// skipped because the caller already has the pattern.
//
// Usage:
//   npx tsx scripts/stamp-editor-pattern.ts <patternJsonPath> <designId> <albumId> <nPage> <title>
//
// Prints "ok=1" as the last line on success (same convention as the other
// batch/generation scripts); exits non-zero and prints the error to stderr
// on failure.
import { readFileSync } from 'fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? 'CrossStitchItems';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BUCKET = 'cross-stitch-editor-designs';

async function main() {
  const [patternJsonPath, designIdStr, albumIdStr, nPage, title] = process.argv.slice(2);
  if (!patternJsonPath || !designIdStr || !albumIdStr || !nPage || !title) {
    console.error('Usage: npx tsx scripts/stamp-editor-pattern.ts <patternJsonPath> <designId> <albumId> <nPage> <title>');
    process.exit(2);
  }
  const designId = parseInt(designIdStr, 10);
  const albumId = parseInt(albumIdStr, 10);

  const pattern = JSON.parse(readFileSync(patternJsonPath, 'utf8'));
  console.log(`Loaded ${patternJsonPath}: ${pattern.width}x${pattern.height}, ${pattern.palette.length} colors`);

  const s3 = new S3Client({ region: REGION });
  const key = `patterns/${designId}.json`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: JSON.stringify({ ...pattern, title }),
    ContentType: 'application/json',
  }));
  console.log(`Uploaded to s3://${BUCKET}/${key}`);

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  await ddb.send(new UpdateCommand({
    TableName: ITEMS_TABLE,
    Key: { ID: `ALB#${albumId.toString().padStart(4, '0')}`, NPage: nPage },
    UpdateExpression: 'SET EditorPatternKey = :k, LastModifiedAt = :u',
    ExpressionAttributeValues: { ':k': key, ':u': new Date().toISOString() },
  }));
  console.log(`DDB stamped: ID=ALB#${albumId.toString().padStart(4, '0')}, NPage=${nPage}`);

  console.log('ok=1');
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
