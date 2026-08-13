import { NextRequest, NextResponse } from 'next/server';
import { loadPattern, updatePattern, deletePattern } from '@/lib/pattern-storage';
import { getSession } from '@/lib/session';
import { getGeneration } from '@/lib/ai-design-generations';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const pattern = await loadPattern(id);
    if (!pattern)
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });

    if (pattern.ownerID) {
      const session = await getSession(request);
      if (!session || session.userId !== pattern.ownerID)
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Track 2 (Opportunity 9): tell the editor whether this AI-draft still
    // needs the Approve/Approve-with-changes review step, so it only shows
    // that UI once per generation, not on every subsequent normal save.
    // Deliberately isolated in its own try/catch: this is an ancillary
    // status check, and a failure in it (e.g. the 2026-08-08 incident
    // where the EB role's DynamoDB policy hadn't been granted access to
    // AiDesignGenerations yet) must never block loading the pattern
    // itself — every AI-draft pattern became unloadable with a generic
    // 500 until this was isolated.
    let needsAiReview = false;
    if (pattern.sourceGenerationId) {
      try {
        const generation = await getGeneration(pattern.sourceGenerationId);
        needsAiReview = generation?.status === 'draft-saved';
      } catch (e) {
        console.error('[converter/patterns] getGeneration failed, defaulting needsAiReview to false:', e);
      }
    }

    return NextResponse.json({ ...pattern, needsAiReview });
  } catch (e) {
    console.error('[converter/patterns] GET error:', e);
    return NextResponse.json({ error: 'Failed to load pattern' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const body = await request.json();
    const { name, width, height, palette, grid, thumbnail, hiddenColors, researchImageKey, sourceImageKey, sourceImageMaskKey } = body;

    if (!Array.isArray(grid) || !Array.isArray(palette))
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    if (typeof width !== 'number' || typeof height !== 'number' || width < 1 || height < 1)
      return NextResponse.json({ error: 'Invalid dimensions' }, { status: 400 });
    if (grid.length !== height || grid[0]?.length !== width)
      return NextResponse.json({ error: 'Grid dimensions mismatch' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const existing = await loadPattern(id);
    if (!existing) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (existing.ownerID && existing.ownerID !== session.userId)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await updatePattern(
      id, String(name ?? 'Untitled'), width, height, palette, grid, session.userId,
      typeof thumbnail === 'string' ? thumbnail : undefined,
      Array.isArray(hiddenColors) ? hiddenColors as number[] : undefined,
      typeof researchImageKey === 'string' ? researchImageKey : undefined,
      typeof sourceImageKey === 'string' ? sourceImageKey : undefined,
      typeof sourceImageMaskKey === 'string' ? sourceImageMaskKey : undefined,
    );
    return NextResponse.json({ id });
  } catch (e) {
    console.error('[converter/patterns] PUT error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to update pattern';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const existing = await loadPattern(id);
    if (!existing) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (existing.ownerID && existing.ownerID !== session.userId)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await deletePattern(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[converter/patterns] DELETE error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to delete pattern';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
