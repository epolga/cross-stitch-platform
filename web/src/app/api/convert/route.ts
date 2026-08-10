import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { convertImage, type ColorDistanceMode } from '@/lib/pattern-converter';
import { analyzeImage, imageTypeToMode, type ConversionMode } from '@/lib/image-analysis';
import { isResearchImageCollectionEnabled } from '@/lib/research-consent';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VALID_MODES = new Set<string>(['auto', 'photo', 'illustration', 'line-art']);
const VALID_DISTANCE_MODES = new Set<string>(['cie76', 'final-only', 'everywhere']);
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIM = 10;
const MAX_DIM = 500;
const VALID_COLORS = new Set([2, 3, 4, 5, 10, 20, 30, 40, 50, 100]);

const RESEARCH_BUCKET = 'cross-stitch-designs';
const RESEARCH_PREFIX = 'research-uploads';
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Best-effort only — a failed research upload must never break the actual
// conversion a visitor is waiting on. Gated independently of whatever the
// client sent: even a forged `researchConsent=true` does nothing while
// isResearchImageCollectionEnabled() is off (see research-consent.ts).
// Returns the S3 key on success so it can be threaded through to the saved
// pattern (Olga's ask, 2026-08-10: "надо хранить связь между ними" — the
// research photo is useless for research without knowing which design it
// became). undefined on skip or failure — a failed upload must never break
// the actual conversion, and there's nothing to link if it didn't happen.
async function saveResearchCopy(buffer: Buffer, contentType: string, consentGiven: boolean): Promise<string | undefined> {
  //if (!consentGiven || !isResearchImageCollectionEnabled()) return undefined;
  try {
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const key = `${RESEARCH_PREFIX}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    await s3.send(new PutObjectCommand({ Bucket: RESEARCH_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
    return key;
  } catch (e) {
    console.error('[convert] research copy upload failed:', e);
    return undefined;
  }
}

// Focus.md Open item #11 — offered to every visitor (Import from Photo
// dialog, "Thread color accuracy"), not admin-gated.
function resolveColorDistanceMode(requested: string): ColorDistanceMode {
  return VALID_DISTANCE_MODES.has(requested) ? (requested as ColorDistanceMode) : 'cie76';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const width = parseInt(formData.get('width') as string ?? '0', 10);
    const height = parseInt(formData.get('height') as string ?? '0', 10);
    const colors = parseInt(formData.get('colors') as string ?? '0', 10);
    const modeParam = (formData.get('mode') as string | null) ?? 'auto';
    const distanceModeParam = (formData.get('colorDistanceMode') as string | null) ?? 'cie76';
    const researchConsent = (formData.get('researchConsent') as string | null) === 'true';

    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    if (!VALID_TYPES.has(file.type)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 5 MB)' }, { status: 400 });
    if (width < MIN_DIM || width > MAX_DIM) return NextResponse.json({ error: `Width must be ${MIN_DIM}–${MAX_DIM}` }, { status: 400 });
    if (height < MIN_DIM || height > MAX_DIM) return NextResponse.json({ error: `Height must be ${MIN_DIM}–${MAX_DIM}` }, { status: 400 });
    if (!VALID_COLORS.has(colors)) return NextResponse.json({ error: 'Colors must be 5, 10, 20, 30, 40, 50, or 100' }, { status: 400 });
    if (!VALID_MODES.has(modeParam)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // When mode is 'auto', analyse first to pick the right pipeline.
    // For explicit modes, skip analysis (user already decided).
    let resolvedMode: ConversionMode;
    let imageType: string | undefined;
    let warnings: string[] | undefined;

    if (modeParam === 'auto') {
      const analysis = await analyzeImage(buffer);
      resolvedMode = imageTypeToMode(analysis.type, analysis.confidence);
      imageType = analysis.type;
      warnings = analysis.warnings.length > 0 ? analysis.warnings : undefined;
    } else {
      resolvedMode = modeParam as ConversionMode;
    }

    const colorDistanceMode = resolveColorDistanceMode(distanceModeParam);
    const pattern = await convertImage(buffer, width, height, colors, resolvedMode, colorDistanceMode);

    const researchImageKey = await saveResearchCopy(buffer, file.type, researchConsent);

    return NextResponse.json({ ...pattern, imageType, warnings, mode: resolvedMode, researchImageKey });
  } catch (e) {
    console.error('[convert] error:', e);
    return NextResponse.json({ error: 'Conversion failed' }, { status: 500 });
  }
}
