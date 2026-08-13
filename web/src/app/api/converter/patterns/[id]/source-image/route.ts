import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { loadPattern } from '@/lib/pattern-storage';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Same bucket convert/route.ts's saveSourceCopy() writes to (pattern-source-
// images/ prefix — separate from research-uploads/, see that file). Serving
// it back only through this owner-checked route (never a direct S3/
// CloudFront URL) so it isn't just a guessable key away from anyone — same
// rationale as catalog-pattern/[designId]'s EditorPatternKey route.
const BUCKET = 'cross-stitch-designs';
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Lets the owner of a pattern re-run the converter against the exact photo
// they originally uploaded, without re-picking the file from their device —
// Olga's ask 2026-08-11. Keyed on sourceImageKey specifically (not
// researchImageKey) — this is the owner getting their own upload back, a
// separate honest checkbox/purpose from research consent (convert/route.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const pattern = await loadPattern(id);
    if (!pattern)
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (!pattern.sourceImageKey)
      return NextResponse.json({ error: 'No source photo stored for this pattern' }, { status: 404 });

    if (pattern.ownerID) {
      const session = await getSession(request);
      if (!session || session.userId !== pattern.ownerID)
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const obj = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: pattern.sourceImageKey,
    }));
    if (!obj.Body)
      return NextResponse.json({ error: 'Source photo missing in storage' }, { status: 500 });

    const rgbBytes = Buffer.from(await obj.Body.transformToByteArray());

    // PNG uploads with real transparency were split into a JPG (RGB) +
    // separate lossless mask on save (convert/route.ts's splitPngForStorage)
    // — recombine them here so "Redo from Photo…" gets back a faithful
    // stand-in for the original PNG (same transparent pixels, so
    // convertImage() classifies them as empty stitches the same way it did
    // the first time), not just the flattened RGB.
    if (pattern.sourceImageMaskKey) {
      const maskObj = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: pattern.sourceImageMaskKey,
      }));
      if (!maskObj.Body)
        return NextResponse.json({ error: 'Source photo mask missing in storage' }, { status: 500 });
      const maskBytes = Buffer.from(await maskObj.Body.transformToByteArray());

      const reconstructed = await sharp(rgbBytes).joinChannel(maskBytes).png().toBuffer();
      return new NextResponse(reconstructed, {
        headers: { 'Content-Type': 'image/png' },
      });
    }

    return new NextResponse(rgbBytes, {
      headers: { 'Content-Type': obj.ContentType || 'image/jpeg' },
    });
  } catch (e) {
    console.error('[converter/patterns/source-image] GET error:', e);
    return NextResponse.json({ error: 'Failed to load source photo' }, { status: 500 });
  }
}
