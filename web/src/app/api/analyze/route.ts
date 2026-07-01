import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '@/lib/image-analysis';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    if (!VALID_TYPES.has(file.type)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 5 MB)' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const analysis = await analyzeImage(buffer);

    return NextResponse.json(analysis);
  } catch (e) {
    console.error('[analyze] error:', e);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
