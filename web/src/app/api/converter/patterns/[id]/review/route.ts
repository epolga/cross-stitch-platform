import { NextRequest, NextResponse } from 'next/server';
import { loadPattern } from '@/lib/pattern-storage';
import { getSession } from '@/lib/session';
import { computeDiffForGeneration, submitReview, isEmptyDiff } from '@/lib/ai-design-corrections';

export const dynamic = 'force-dynamic';

// Track 2 (Opportunity 9) — the Approve/Approve-with-changes review step
// from docs/genai-growth/DESIGN_FEEDBACK_LOOP.md's "Provenance mechanism".
// One endpoint, called up to twice by the client:
//   1. POST with no body (or {} ) — server diffs against the review
//      baseline (the previous round's end-state, or the AI-generated
//      snapshot for round 1 — see computeDiffForGeneration()) and the
//      pattern's current saved state. An empty diff (the "Approve, no
//      changes" case) finalizes immediately. A non-empty diff is returned
//      WITHOUT being persisted yet, for the UI to show and ask "what were
//      you fixing" — finalized: false tells the client to call again.
//   2. POST with { reasonTags, freeTextComment } — only reached when step 1
//      returned finalized: false. The diff is recomputed fresh from the
//      DB (never trusts a client-submitted diff) and persisted this time.
// Always reads grid/palette from the pattern's own current saved state,
// never from the request body — nothing here should trust client-supplied
// pattern data for what "current" means.
//
// 2026-08-08 (Olga's ask): this used to be a one-shot "ask once per
// generation" flow — submitReview() flipped the generation's status to
// 'reviewed' and the editor never offered the dialog again. Now every
// save on an AI-draft offers review again, each one its own round
// (AiDesignCorrection.roundNumber), diffed against the previous round's
// end-state rather than the cumulative diff since the AI's original
// output — see ai-design-generations.ts's recordReviewRound().
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const pattern = await loadPattern(id);
    if (!pattern) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (pattern.ownerID && pattern.ownerID !== session.userId)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!pattern.sourceGenerationId)
      return NextResponse.json({ error: 'This pattern has no AI-draft provenance to review' }, { status: 400 });

    const diff = await computeDiffForGeneration(pattern.sourceGenerationId, pattern.grid, pattern.palette);
    if (!diff)
      return NextResponse.json({ error: 'No AI-draft snapshot found for this pattern' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const reasonTags = Array.isArray(body.reasonTags) ? (body.reasonTags as string[]) : undefined;
    const freeTextComment = typeof body.freeTextComment === 'string' ? body.freeTextComment : undefined;

    if (isEmptyDiff(diff) || reasonTags !== undefined) {
      // Either nothing to explain, or the client already answered — finalize now.
      const result = await submitReview(pattern.sourceGenerationId, diff, reasonTags ?? [], freeTextComment, pattern.grid, pattern.palette);
      return NextResponse.json({ diff, finalized: true, acceptedOrRejected: result.acceptedOrRejected });
    }

    // Non-empty diff, no reason given yet — hand it back for the UI to show.
    return NextResponse.json({ diff, finalized: false });
  } catch (e) {
    console.error('[converter/patterns/review] POST error:', e);
    return NextResponse.json({ error: 'Failed to review pattern' }, { status: 500 });
  }
}
