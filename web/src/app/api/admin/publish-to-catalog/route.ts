// Publishes a design built in the editor straight to the live catalog:
// allocates NPage/DesignID/NGlobalPage, generates + uploads the kit PDFs and
// cover/pin image, creates a real Pinterest pin, generates an AI SEO
// description, inserts the DynamoDB DESIGN record, stamps the editor
// pattern, and refreshes the in-process design cache. The web-admin
// replacement for uploader/UploaderCli's folder-based publish flow — see
// that file (and shared/.../PinterestUploader.cs) for the reference
// sequence this ports. Non-transactional, same as the desktop tool: once
// S3 uploads happen there's no automatic rollback, only best-effort
// warnings for the steps after the Pinterest pin succeeds.

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAdmin } from '@/lib/admin-auth';
import { refreshCache } from '@/lib/data-access';
import { getNextNPage, getNextDesignId, getMaxGlobalPage, getAlbumCaption } from '@/lib/design-sequencing';
import { buildPatternPdf } from '@/lib/pattern-pdf';
import { renderCoverThumbnailPng } from '@/lib/server-cover-thumbnail';
import { createPinterestPin, PinterestApiError } from '@/lib/pinterest-pin';
import { generateSeoDescription } from '@/lib/design-seo-description';
import type { PatternPalette } from '@/lib/pattern-converter';

export const dynamic = 'force-dynamic';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ITEMS_TABLE = process.env.DYNAMODB_TABLE_NAME || 'CrossStitchItems';
const DESIGNS_BUCKET = 'cross-stitch-designs';
const EDITOR_BUCKET = 'cross-stitch-editor-designs';
const PHOTO_PREFIX = 'photos';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: REGION });

interface PublishRequestBody {
  albumId: number;
  title: string;
  width?: number;
  height?: number;
  grid: number[][];
  palette: PatternPalette[];
  previewImage?: string; // data URL from PatternCanvas.capturePreview(), jpeg or png
}

function albumPk(albumId: number): string {
  return `ALB#${albumId.toString().padStart(4, '0')}`;
}

function decodeDataUrlImage(dataUrl: string): { buffer: Buffer; ext: 'png' | 'jpg'; contentType: string } {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Unrecognized preview image format');
  const isPng = match[1] === 'png';
  return {
    buffer: Buffer.from(match[2], 'base64'),
    ext: isPng ? 'png' : 'jpg',
    contentType: isPng ? 'image/png' : 'image/jpeg',
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const warnings: string[] = [];

  try {
    const body = await request.json() as PublishRequestBody;
    const { albumId, grid, palette, previewImage } = body;
    const title = body.title?.trim();

    if (!albumId || albumId <= 0) {
      return NextResponse.json({ error: 'Album ID is required' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: 'Design title is required' }, { status: 400 });
    }
    if (!grid?.length || !palette?.length) {
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    }

    const width = body.width ?? grid[0]?.length ?? 0;
    const height = body.height ?? grid.length;

    // Actual used color count (a hidden/unused palette entry shouldn't count) —
    // same usage-counting approach as buildPatternPdf's usedPalette.
    const usageCounts = new Array(palette.length).fill(0);
    for (const row of grid) for (const ci of row) if (ci >= 0 && ci < palette.length) usageCounts[ci]++;
    const nColors = usageCounts.filter(c => c > 0).length;

    // 1. Sequencing — no locking, this is a rare manual admin action (see design-sequencing.ts)
    const [nPage, designId, maxGlobalPage, albumCaption] = await Promise.all([
      getNextNPage(albumId),
      getNextDesignId(),
      getMaxGlobalPage(),
      getAlbumCaption(albumId),
    ]);
    const nGlobalPage = maxGlobalPage + 1;
    const nPagePadded = nPage.toString().padStart(5, '0');

    // 2. Cover / pin image — the client-captured stitched-chart render, or a
    // server-rendered fallback if none was sent (no "original photo" survives
    // past conversion in this editor, see ConvertClient.tsx's handleImport()).
    let imageBuffer: Buffer;
    let imageContentType: string;
    let photoFileName: string;
    if (previewImage) {
      const decoded = decodeDataUrlImage(previewImage);
      imageBuffer = decoded.buffer;
      imageContentType = decoded.contentType;
      photoFileName = `4.${decoded.ext}`;
    } else {
      imageBuffer = await renderCoverThumbnailPng(grid, palette);
      imageContentType = 'image/png';
      photoFileName = '4.png';
    }

    // 3. Kit PDFs (color+symbol / symbol / color) — in-process, no HTTP round-trip
    const [kitPdfColorSymbol, kitPdfSymbol, kitPdfColor] = await Promise.all([
      buildPatternPdf({ grid, palette, title, chartMode: 'color-symbol', previewImage }),
      buildPatternPdf({ grid, palette, title, chartMode: 'symbol', previewImage }),
      buildPatternPdf({ grid, palette, title, chartMode: 'color', previewImage }),
    ]);

    // 4. S3 uploads — PDFs + image, same key scheme as UploaderCli's
    // UploadPdfToS3Async/UploadPhotoFileAsync.
    const pdfFolder = `pdfs/${albumId}/${designId}`;
    await Promise.all([
      s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: `pdfs/${albumId}/Stitch${designId}_Kit.pdf`, Body: kitPdfColorSymbol, ContentType: 'application/pdf' })),
      s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: `${pdfFolder}/Stitch${designId}_1_Kit.pdf`, Body: kitPdfColorSymbol, ContentType: 'application/pdf' })),
      s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: `${pdfFolder}/Stitch${designId}_3_Kit.pdf`, Body: kitPdfSymbol, ContentType: 'application/pdf' })),
      s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: `${pdfFolder}/Stitch${designId}_5_Kit.pdf`, Body: kitPdfColor, ContentType: 'application/pdf' })),
      s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: `${PHOTO_PREFIX}/${albumId}/${designId}/${photoFileName}`, Body: imageBuffer, ContentType: imageContentType })),
    ]);

    // 5. Pinterest pin — required; abort before the DynamoDB insert if this
    // fails (same hard guard InsertItemIntoDynamoDbAsync has on PinId).
    // S3 objects above stay as harmless orphans and the sequence numbers as
    // burned, same limitation the desktop tool already accepts.
    let pinResult;
    try {
      pinResult = await createPinterestPin({
        pattern: { title, width, height, nColors },
        albumId, designId, nPage, photoFileName,
      });
    } catch (e) {
      const msg = e instanceof PinterestApiError ? e.message : (e instanceof Error ? e.message : String(e));
      console.error('[publish-to-catalog] Pinterest pin failed:', msg);
      return NextResponse.json({
        error: `Pinterest pin failed — aborted before the catalog insert: ${msg}`,
        designId, nPage: nPagePadded, nGlobalPage,
      }, { status: 502 });
    }

    // 6. AI SEO description — non-fatal
    let seoDescription: string | null = null;
    try {
      seoDescription = await generateSeoDescription({
        title, albumCaption, width, height, nColors,
        imageBase64: imageBuffer.toString('base64'),
        imageMediaType: imageContentType as 'image/png' | 'image/jpeg',
      });
    } catch (e) {
      warnings.push(`SEO description generation failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 7. DynamoDB DESIGN insert — field list mirrors InsertItemIntoDynamoDbAsync
    await ddb.send(new PutCommand({
      TableName: ITEMS_TABLE,
      Item: {
        ID: albumPk(albumId),
        NPage: nPagePadded,
        AlbumID: albumId,
        Caption: title,
        // Short technical line, same format the desktop Uploader writes
        // (parsed from the source PDF there; synthesized here since this
        // flow has no source PDF to parse). The long-form prose lives in
        // SeoDescription below — this field is what design pages fall back
        // to showing when SeoDescription is absent, so it must never be ''.
        Description: `${width} x ${height} stitches ${nColors} colors`,
        DesignID: designId,
        EntityType: 'DESIGN',
        Height: height,
        Width: width,
        NColors: nColors,
        NDownloaded: 0,
        NGlobalPage: nGlobalPage,
        Notes: '',
        PinID: pinResult.pinId,
        PinLinkType: 'DESIGN',
        ...(seoDescription ? { SeoDescription: seoDescription } : {}),
      },
    }));

    // 8. Editor-pattern stamp — best-effort, non-fatal (mirrors
    // scripts/stamp-editor-pattern.ts, but inlined since grid/palette are
    // already in memory here).
    try {
      const patternKey = `patterns/${designId}.json`;
      await s3.send(new PutObjectCommand({
        Bucket: EDITOR_BUCKET,
        Key: patternKey,
        Body: JSON.stringify({ grid, palette, width, height, title }),
        ContentType: 'application/json',
      }));
      await ddb.send(new UpdateCommand({
        TableName: ITEMS_TABLE,
        Key: { ID: albumPk(albumId), NPage: nPagePadded },
        UpdateExpression: 'SET EditorPatternKey = :k, LastModifiedAt = :u',
        ExpressionAttributeValues: { ':k': patternKey, ':u': new Date().toISOString() },
      }));
    } catch (e) {
      warnings.push(`Editor-pattern stamp failed (design page will still work, "Open in editor" won't yet): ${e instanceof Error ? e.message : String(e)}`);
    }

    // 9. Cache refresh — in-process; cross-stitch-com-env-clone runs a single
    // EC2 instance, so this is equivalent to the desktop tool's EB restart
    // step without the availability blip. Re-check if the env ever scales out.
    try {
      await refreshCache();
    } catch (e) {
      warnings.push(`Cache refresh failed — retry via the "Refresh design cache" admin button: ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json({
      designId,
      pinId: pinResult.pinId,
      nPage: nPagePadded,
      nGlobalPage,
      patternUrl: pinResult.patternUrl,
      boardId: pinResult.boardId,
      warnings,
    });
  } catch (e) {
    console.error('[admin/publish-to-catalog] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Publish failed' }, { status: 500 });
  }
}
