import { NextRequest, NextResponse } from 'next/server';
import { convertImage } from '@/lib/pattern-converter';
import { analyzeImage, imageTypeToMode, type ConversionMode } from '@/lib/image-analysis';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VALID_MODES = new Set<string>(['auto', 'photo', 'line-art']);
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIM = 10;
const MAX_DIM = 500;
const VALID_COLORS = new Set([5, 10, 20, 30, 40, 50, 100]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const width = parseInt(formData.get('width') as string ?? '0', 10);
    const height = parseInt(formData.get('height') as string ?? '0', 10);
    const colors = parseInt(formData.get('colors') as string ?? '0', 10);
    const modeParam = (formData.get('mode') as string | null) ?? 'auto';

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
      resolvedMode = imageTypeToMode(analysis.type);
      imageType = analysis.type;
      warnings = analysis.warnings.length > 0 ? analysis.warnings : undefined;
    } else {
      resolvedMode = modeParam as ConversionMode;
    }

    const pattern = await convertImage(buffer, width, height, colors, resolvedMode);

    return NextResponse.json({ ...pattern, imageType, warnings, mode: resolvedMode });
  } catch (e) {
    console.error('[convert] error:', e);
    return NextResponse.json({ error: 'Conversion failed' }, { status: 500 });
  }
}
