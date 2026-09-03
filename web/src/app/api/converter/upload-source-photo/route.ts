import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { isResearchImageCollectionEnabled } from '@/lib/research-consent';

export const dynamic = 'force-dynamic';

// Moved out of api/convert/route.ts 2026-09-03 (Track "defer S3 upload to
// Save" in docs/web/source-image-key-sharing-and-orphans-2026-09.md): the
// vast majority of the S3 orphan backlog (Finding 1 of that doc, ~506 MiB)
// came from /api/convert uploading a copy on every conversion attempt,
// regardless of whether the resulting pattern was ever saved. The browser
// already keeps the original File in memory for the whole editing session
// (ImportFromPhotoDialog's selectedFile ref — confirmed via
// openImportDialog()'s in-memory-first Redo path in ConvertClient.tsx), so
// there was never a need to persist it to S3 before the owner actually
// clicks Save. This route is called instead, only at Save time
// (ConvertClient.tsx's handleSavePattern()), so an abandoned conversion —
// the common case — never touches S3 at all.
//
// researchImageKey is handled here too, for now, since it shares the same
// uploaded buffer as sourceImageKey — worth revisiting if research
// collection (currently disabled pending GDPR review,
// isResearchImageCollectionEnabled()) is ever re-enabled with an intent to
// capture *every* attempt, saved or not; deferring to Save-time would
// undercount for that specific purpose.

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

const DESIGNS_BUCKET = 'cross-stitch-designs'; // shared by both copies below, different prefixes
const RESEARCH_PREFIX = 'research-uploads';
const SOURCE_PREFIX = 'pattern-source-images';
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
// key (see the fuller history in the git log for api/convert/route.ts,
// 2026-08-13) — re-uploading the same bytes (a Redo, or now also a resave
// within the same session) is naturally idempotent, objectExists() skips
// the PutObject.
function contentKey(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// Best-effort only — a failed research upload must never break saving the
// pattern itself. Gated independently of whatever the client sent: even a
// forged researchConsent=true does nothing while
// isResearchImageCollectionEnabled() is off (research-consent.ts).
async function saveResearchCopy(buffer: Buffer, contentType: string, consentGiven: boolean): Promise<string | undefined> {
  if (!consentGiven || !isResearchImageCollectionEnabled()) return undefined;
  try {
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const key = `${RESEARCH_PREFIX}/${contentKey(buffer)}.${ext}`;
    if (!(await objectExists(key))) {
      await s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
    }
    return key;
  } catch (e) {
    console.error('[upload-source-photo] research copy upload failed:', e);
    return undefined;
  }
}

// "Keep my photo so I can redo this conversion later" — the owner getting
// their own upload back, not us using it for anything. Same best-effort
// shape as saveResearchCopy(): a failed upload must never break saving the
// pattern itself.
async function saveSourceCopy(buffer: Buffer, contentType: string, keepConsent: boolean): Promise<string | undefined> {
  if (!keepConsent) return undefined;
  try {
    const hash = contentKey(buffer);
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const key = `${SOURCE_PREFIX}/${hash}.${ext}`;
    if (!(await objectExists(key))) {
      await s3.send(new PutObjectCommand({ Bucket: DESIGNS_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
    }
    return key;
  } catch (e) {
    console.error('[upload-source-photo] source copy upload failed:', e);
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const researchConsent = (formData.get('researchConsent') as string | null) === 'true';
    const keepForReuse = (formData.get('keepForReuse') as string | null) === 'true';

    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    if (!VALID_TYPES.has(file.type)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 5 MB)' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    const researchImageKey = await saveResearchCopy(buffer, file.type, researchConsent);
    const sourceImageKey = await saveSourceCopy(buffer, file.type, keepForReuse);

    return NextResponse.json({ researchImageKey, sourceImageKey });
  } catch (e) {
    console.error('[upload-source-photo] error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
