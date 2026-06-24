import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { semanticSearch } from '@/lib/semantic-search';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

async function describeImageForSearch(base64: string, mediaType: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        },
        {
          type: 'text',
          text: 'Describe this image in 1–2 plain sentences (no markdown, no headers) focusing on subject, colors, and style. This description will be used to find matching cross-stitch patterns.',
        },
      ],
    }],
  });
  const block = msg.content[0];
  return block.type === 'text' ? block.text : '';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    console.log('[image-search] file:', file?.name, file?.type, file?.size);
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    if (!VALID_TYPES.has(file.type)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 5 MB)' }, { status: 400 });

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    console.log('[image-search] base64 length:', base64.length);

    const description = await describeImageForSearch(base64, file.type);
    console.log('[image-search] Claude description:', description);
    if (!description) return NextResponse.json({ error: 'Could not analyse image' }, { status: 500 });

    const designIds = await semanticSearch(description, 60);
    console.log('[image-search] Top-10 IDs:', designIds.slice(0, 10));
    return NextResponse.json({ designIds, description });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[image-search] Unhandled error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
