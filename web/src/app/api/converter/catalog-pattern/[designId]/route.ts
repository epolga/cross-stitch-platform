import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getDesignById } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

// The cross-stitch-editor-designs bucket has no public access at all (Olga's
// call, 2026-07-27) — this route is the only way to read a catalog design's
// editor-pattern JSON, fetched here with the app's own AWS credentials and
// re-served to the client, rather than a direct/CloudFront S3 URL like the
// (public) kit PDFs use.
const BUCKET = 'cross-stitch-editor-designs';
const s3Client = new S3Client({ region: process.env.AWS_REGION });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ designId: string }> },
) {
  try {
    const { designId: designIdStr } = await params;
    const designId = parseInt(designIdStr, 10);
    if (!Number.isFinite(designId) || designId <= 0)
      return NextResponse.json({ error: 'Invalid design ID' }, { status: 400 });

    const design = await getDesignById(designId);
    if (!design || !design.EditorPatternKey)
      return NextResponse.json({ error: 'No editor pattern for this design' }, { status: 404 });

    const obj = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: design.EditorPatternKey,
    }));
    if (!obj.Body)
      return NextResponse.json({ error: 'Pattern data missing in storage' }, { status: 500 });

    const json = await obj.Body.transformToString();
    return new NextResponse(json, { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[converter/catalog-pattern] GET error:', e);
    return NextResponse.json({ error: 'Failed to load catalog pattern' }, { status: 500 });
  }
}
