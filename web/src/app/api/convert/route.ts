import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import path from 'path';
import Piscina from 'piscina';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { ColorDistanceMode } from '@/lib/pattern-converter';
import { analyzeImage, imageTypeToMode, type ConversionMode } from '@/lib/image-analysis';
import { isResearchImageCollectionEnabled } from '@/lib/research-consent';

export const dynamic = 'force-dynamic';

// convertImage() runs k-means color quantization, CIEDE2000, and DMC
// matching - synchronous CPU-bound work that would otherwise block this
// instance's entire event loop (including its own health check) for the
// duration. Runs in a worker-thread pool instead - see
// docs/web/photo-converter-cpu-saturation-2026-09.md.
// Lazily created on first request, not at module load time: `next build`
// imports every route file during "Collecting page data" to statically
// analyze it, and a module-top-level `new Piscina(...)` would spin up
// real worker threads during the build itself (confirmed: caused
// "Cannot find module .../chunks/worker.js" errors from Next's own
// internal build-time worker pool colliding with this one).
let convertPool: Piscina | undefined;
function getConvertPool(): Piscina {
  if (!convertPool) {
    convertPool = new Piscina({
      filename: path.join(process.cwd(), 'workers', 'convert-worker.js'),
    });
  }
  return convertPool;
}

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VALID_MODES = new Set<string>(['auto', 'photo', 'illustration', 'line-art']);
const VALID_DISTANCE_MODES = new Set<string>(['cie76', 'final-only', 'everywhere']);
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIM = 10;
const MAX_DIM = 500;
const VALID_COLORS = new Set([2, 3, 4, 5, 10, 20, 30, 40, 50, 100]);

const DESIGNS_BUCKET = 'cross-stitch-designs'; // shared by both copies below, different prefixes
const RESEARCH_PREFIX = 'research-uploads';
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: DESIGNS_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Content-addressed key: sha256 of the exact bytes being stored under this
// key. 2026-08-13 (Olga's ask) — Redo reconverts the same file with
// different width/colors/mode, hitting saveResearchCopy/saveSourceCopy
// again each time; a random key per call meant every Redo left behind a
// fresh, orphaned duplicate in S3. Deriving the key from content instead of
// randomUUID() makes re-uploading the same bytes naturally idempotent (same
// content -> same key -> objectExists() skips the PutObject) with no need
// for the client to assert "this is the same file as last time" — which
// would otherwise be a trust-the-client footgun: source-image/route.ts
// serves sourceImageKey back to whoever owns the *pattern* it's attached
// to, so blindly accepting a client-supplied "reuse this key" value would
// let anyone attach an arbitrary (possibly someone else's) key to a new
// pattern they own and read it back through that route. Content-addressing
// sidesteps this entirely: the only key you can ever produce is one for
// bytes you already possess.
function contentKey(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

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
  // 2026-08-11: this gate had degenerated into `if (contentType == undefined) return`
  // nested inside the real condition — contentType is always a validated
  // non-empty string by the time this runs, so that inner check could never
  // fire and the function uploaded to S3 unconditionally, consent and flag
  // both ignored. Confirmed live: research-uploads/ had files from after
  // this reached production. Restored to the one condition that matters.
  if (!consentGiven || !isResearchImageCollectionEnabled()) return undefined;
  try {
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const key = `${RESEARCH_PREFIX}/${contentKey(buffer)}.${ext}`;
    if (!(await objectExists(key))) {
      await s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
    }
    return key;
  } catch (e) {
    console.error('[convert] research copy upload failed:', e);
    return undefined;
  }
}

const SOURCE_PREFIX = 'pattern-source-images';

// 2026-08-11 (Olga's ask): a separate, honestly-labeled offer from the
// research one above — "keep my photo so I can redo this conversion
// later" is the visitor getting their own upload back, not us using it for
// anything. Not gated by isResearchImageCollectionEnabled() or any GDPR
// review — that flag/review is specifically about the *research* use case.
// Same best-effort shape as saveResearchCopy(): a failed upload must never
// break the conversion itself.
//
// 2026-08-13: briefly stored PNGs as JPG+lossless-alpha-mask here (see git
// history / png-jpg-mask.ts) to save S3 space. Reverted the same day (Olga:
// "у нас же нет проблем с местом" — storage isn't actually a real
// constraint) once real testing showed the cost: JPEG's lossy compression
// visibly shifts the DMC palette a later "Redo from Photo…" picks,
// especially on a stark bimodal image (confirmed on a real photo — only
// 20/40 DMC colors survived unchanged after one JPG round-trip at quality
// 92). Storing the source unchanged means every Redo reconverts from the
// exact original bytes again, not a lossy copy of them.
// splitPngForStorage() (png-jpg-mask.ts) and its CLI
// (scripts/png-to-jpg-with-mask.ts) are left in place, unused here — still
// available for a deliberate one-off manual conversion, just not run
// automatically on every PNG upload anymore. sourceImageMaskKey is still
// read back by source-image/route.ts for any pattern saved while this was
// active, so those keep working.
async function saveSourceCopy(
  buffer: Buffer,
  contentType: string,
  keepConsent: boolean,
): Promise<{ key?: string; maskKey?: string }> {
  if (!keepConsent) return {};
  try {
    const hash = contentKey(buffer);
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const key = `${SOURCE_PREFIX}/${hash}.${ext}`;
    if (!(await objectExists(key))) {
      await s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
    }
    return { key };
  } catch (e) {
    console.error('[convert] source copy upload failed:', e);
    return {};
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
    const keepForReuse = (formData.get('keepForReuse') as string | null) === 'true';

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
    const pattern = await getConvertPool().run({
      buffer,
      width,
      height,
      colors,
      mode: resolvedMode,
      colorDistanceMode,
    });

    const researchImageKey = await saveResearchCopy(buffer, file.type, researchConsent);
    const { key: sourceImageKey, maskKey: sourceImageMaskKey } = await saveSourceCopy(buffer, file.type, keepForReuse);

    return NextResponse.json({ ...pattern, imageType, warnings, mode: resolvedMode, researchImageKey, sourceImageKey, sourceImageMaskKey });
  } catch (e) {
    console.error('[convert] error:', e);
    return NextResponse.json({ error: 'Conversion failed' }, { status: 500 });
  }
}
