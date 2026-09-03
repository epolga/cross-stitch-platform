import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import Piscina from 'piscina';
import type { ColorDistanceMode } from '@/lib/pattern-converter';
import { analyzeImage, imageTypeToMode, type ConversionMode } from '@/lib/image-analysis';

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

// docs/session-log/2026-08.md "Closed item #11" — offered to every visitor
// (Import from Photo dialog, "Thread color accuracy"), not admin-gated.
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

    // sourceImageKey/researchImageKey are no longer uploaded here — see
    // api/converter/upload-source-photo/route.ts, called only at Save
    // time instead, so an abandoned (never-saved) conversion never writes
    // to S3 at all.
    return NextResponse.json({ ...pattern, imageType, warnings, mode: resolvedMode });
  } catch (e) {
    console.error('[convert] error:', e);
    return NextResponse.json({ error: 'Conversion failed' }, { status: 500 });
  }
}
