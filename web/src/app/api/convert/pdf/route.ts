import { NextRequest, NextResponse } from 'next/server';
import { buildPatternPdf, type BuildPatternPdfInput } from '@/lib/pattern-pdf';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as BuildPatternPdfInput;
    if (!body.grid?.length || !body.palette?.length) {
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    }
    const buffer = await buildPatternPdf(body);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="cross-stitch-pattern.pdf"',
      },
    });
  } catch (e) {
    console.error('[convert/pdf] error:', e);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
