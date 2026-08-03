import { NextRequest, NextResponse } from 'next/server';
import { convertImage, type ColorDistanceMode } from '@/lib/pattern-converter';
import { analyzeImage, imageTypeToMode, type ConversionMode } from '@/lib/image-analysis';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VALID_MODES = new Set<string>(['auto', 'photo', 'illustration', 'line-art']);
const VALID_DISTANCE_MODES = new Set<string>(['cie76', 'final-only', 'everywhere']);
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIM = 10;
const MAX_DIM = 500;
const VALID_COLORS = new Set([2, 3, 4, 5, 10, 20, 30, 40, 50, 100]);

// Focus.md Open item #11 — regular users always get 'cie76' (unchanged
// behavior); a non-default value is only honored for verified admin
// accounts, regardless of what the client sends (the dialog only shows the
// control to admins, but this is the actual enforcement point).
async function resolveColorDistanceMode(request: NextRequest, requested: string): Promise<ColorDistanceMode> {
  if (!VALID_DISTANCE_MODES.has(requested) || requested === 'cie76') return 'cie76';
  const session = await getSession(request);
  if (!session) return 'cie76';
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(session.email.toLowerCase())) return 'cie76';
  return requested as ColorDistanceMode;
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

    const colorDistanceMode = await resolveColorDistanceMode(request, distanceModeParam);
    const pattern = await convertImage(buffer, width, height, colors, resolvedMode, colorDistanceMode);

    return NextResponse.json({ ...pattern, imageType, warnings, mode: resolvedMode });
  } catch (e) {
    console.error('[convert] error:', e);
    return NextResponse.json({ error: 'Conversion failed' }, { status: 500 });
  }
}
