import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import Piscina from 'piscina';
import type { BuildPatternPdfInput } from '@/lib/pattern-pdf';

export const dynamic = 'force-dynamic';

// buildPatternPdf() lays out the full print PDF (cover, key, chart pages)
// synchronously via pdf-lib + @napi-rs/canvas - same blocking-event-loop
// concern as convertImage(), see
// docs/web/photo-converter-cpu-saturation-2026-09.md.
// Lazily created on first request, not at module load time - see the
// matching comment in ../route.ts for why (build-time worker-pool
// collision with Next's own internal build workers).
let pdfPool: Piscina | undefined;
function getPdfPool(): Piscina {
  if (!pdfPool) {
    pdfPool = new Piscina({
      filename: path.join(process.cwd(), 'workers', 'pdf-worker.js'),
    });
  }
  return pdfPool;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as BuildPatternPdfInput;
    if (!body.grid?.length || !body.palette?.length) {
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    }
    const buffer = await getPdfPool().run(body);
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
