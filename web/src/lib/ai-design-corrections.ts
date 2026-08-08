// Track 2 (Opportunity 9) — the second half of the provenance/correction
// schema (docs/genai-growth/DESIGN_FEEDBACK_LOOP.md "Data store and
// provenance tracking"). AiDesignGenerations (ai-design-generations.ts)
// holds the immutable "as-generated" snapshot; this file computes the diff
// against Olga's edited version and persists the resulting correction
// record — the ties-both-dimensions-to-downloads database she asked for
// (prompt->downloads via generationId, corrections->downloads via this
// table's own designId), and the concrete answer to open question #3
// ("where does the diff actually get computed") from that doc.

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  ScanCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import type { PatternPalette } from './pattern-converter';
import { getGeneration, recordReviewRound } from './ai-design-generations';

const TABLE = process.env.DDB_AI_DESIGN_CORRECTIONS_TABLE || 'AiDesignCorrections';
const REGION = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region: REGION });

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      try {
        await client.send(new DescribeTableCommand({ TableName: TABLE }));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== 'ResourceNotFoundException') throw e;
        await client.send(
          new CreateTableCommand({
            TableName: TABLE,
            KeySchema: [{ AttributeName: 'correctionId', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'correctionId', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
          }),
        );
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
          if (Table?.TableStatus === 'ACTIVE') break;
        }
      }
    })().catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

// ── Pure diff logic (no I/O, unit-testable) ─────────────────────────────────

export interface GridDiffSummary {
  dimensionsChanged: boolean;
  beforeDimensions: { width: number; height: number };
  afterDimensions: { width: number; height: number };
  // null when dimensions differ — cell-by-cell position comparison isn't
  // meaningful across a resize (e.g. Size to Design), colorsAdded/Removed
  // still is.
  cellsChanged: number | null;
  colorsAdded: string[]; // DMC numbers present after but not before
  colorsRemoved: string[]; // DMC numbers present before but not after
  colorsUnchanged: number;
}

/**
 * Compares by resolved DMC number per cell, not raw palette index — so a
 * palette that got reordered (e.g. after removeUnusedColors renumbers
 * indices) without actually changing any stitch's color doesn't show up
 * as a spurious diff.
 */
export function diffPatterns(
  before: { grid: number[][]; palette: PatternPalette[] },
  after: { grid: number[][]; palette: PatternPalette[] },
): GridDiffSummary {
  const beforeHeight = before.grid.length;
  const beforeWidth = before.grid[0]?.length ?? 0;
  const afterHeight = after.grid.length;
  const afterWidth = after.grid[0]?.length ?? 0;
  const dimensionsChanged = beforeWidth !== afterWidth || beforeHeight !== afterHeight;

  let cellsChanged: number | null = null;
  if (!dimensionsChanged) {
    cellsChanged = 0;
    for (let y = 0; y < beforeHeight; y++) {
      for (let x = 0; x < beforeWidth; x++) {
        const beforeIdx = before.grid[y][x];
        const afterIdx = after.grid[y][x];
        const beforeNumber = beforeIdx >= 0 ? before.palette[beforeIdx]?.number : null;
        const afterNumber = afterIdx >= 0 ? after.palette[afterIdx]?.number : null;
        if (beforeNumber !== afterNumber) cellsChanged++;
      }
    }
  }

  const beforeColors = new Set(before.palette.map((p) => p.number));
  const afterColors = new Set(after.palette.map((p) => p.number));
  const colorsAdded = [...afterColors].filter((n) => !beforeColors.has(n));
  const colorsRemoved = [...beforeColors].filter((n) => !afterColors.has(n));
  const colorsUnchanged = [...beforeColors].filter((n) => afterColors.has(n)).length;

  return {
    dimensionsChanged,
    beforeDimensions: { width: beforeWidth, height: beforeHeight },
    afterDimensions: { width: afterWidth, height: afterHeight },
    cellsChanged,
    colorsAdded,
    colorsRemoved,
    colorsUnchanged,
  };
}

/** Empty diff = the "Approve, no changes" case (DESIGN_FEEDBACK_LOOP.md's
 * UI/UX flow step 2) — no reason-tag question should be asked when this
 * is true. */
export function isEmptyDiff(diff: GridDiffSummary): boolean {
  return !diff.dimensionsChanged && diff.cellsChanged === 0 && diff.colorsAdded.length === 0 && diff.colorsRemoved.length === 0;
}

// ── Persisted correction record ─────────────────────────────────────────────

export type AcceptedOrRejected = 'approve' | 'approve-with-changes';

export interface AiDesignCorrection {
  correctionId: string;
  generationId: string;
  designId?: number;
  // Added 2026-08-08 — which review round this is for the generation (1,
  // 2, 3, ...). Multiple corrections per generation are now expected
  // (Olga's ask: every save on an AI-draft offers review, not just the
  // first) — this makes the sequence explicit rather than relying on
  // sorting by createdAt.
  roundNumber: number;
  diff: GridDiffSummary;
  reasonTags: string[];
  freeTextComment?: string;
  acceptedOrRejected: AcceptedOrRejected;
  createdAt: string;
}

function itemToRecord(item: Record<string, AttributeValue>): AiDesignCorrection {
  return {
    correctionId: item.correctionId.S!,
    generationId: item.generationId?.S ?? '',
    designId: item.designId?.N ? parseInt(item.designId.N, 10) : undefined,
    roundNumber: item.roundNumber?.N ? parseInt(item.roundNumber.N, 10) : 1,
    diff: item.diff?.S ? JSON.parse(item.diff.S) : { dimensionsChanged: false, beforeDimensions: { width: 0, height: 0 }, afterDimensions: { width: 0, height: 0 }, cellsChanged: 0, colorsAdded: [], colorsRemoved: [], colorsUnchanged: 0 },
    reasonTags: item.reasonTags?.SS ?? [],
    freeTextComment: item.freeTextComment?.S,
    acceptedOrRejected: (item.acceptedOrRejected?.S as AcceptedOrRejected) ?? 'approve',
    createdAt: item.createdAt?.S ?? '',
  };
}

async function saveCorrection(params: {
  generationId: string;
  roundNumber: number;
  diff: GridDiffSummary;
  reasonTags: string[];
  freeTextComment?: string;
  acceptedOrRejected: AcceptedOrRejected;
}): Promise<string> {
  await ensureTable();
  const correctionId = randomUUID();
  const now = new Date().toISOString();

  const item: Record<string, AttributeValue> = {
    correctionId: { S: correctionId },
    generationId: { S: params.generationId },
    roundNumber: { N: String(params.roundNumber) },
    diff: { S: JSON.stringify(params.diff) },
    acceptedOrRejected: { S: params.acceptedOrRejected },
    createdAt: { S: now },
  };
  // DynamoDB rejects an empty String Set (SS) — omit reasonTags entirely
  // rather than writing one, matching the "Approve, no changes" case where
  // no reason question is asked at all.
  if (params.reasonTags.length > 0) item.reasonTags = { SS: params.reasonTags };
  if (params.freeTextComment) item.freeTextComment = { S: params.freeTextComment };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));
  return correctionId;
}

/**
 * Table-scoped Scan with a filter, not a Query — correctionId (the only
 * key) isn't generationId, and this table isn't expected to grow large
 * enough to need a GSI (matches the "no GSI needed, periodic low-volume
 * reporting" reasoning already used for AiDesignGenerations — see
 * DESIGN_FEEDBACK_LOOP.md).
 */
export async function listCorrectionsForGeneration(generationId: string): Promise<AiDesignCorrection[]> {
  await ensureTable();
  const results: AiDesignCorrection[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await client.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'generationId = :g',
      ExpressionAttributeValues: { ':g': { S: generationId } },
      ExclusiveStartKey: lastKey,
    }));
    results.push(...Items.map((i) => itemToRecord(i as Record<string, AttributeValue>)));
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return results;
}

/** Backfills designId once the pattern is published — same join key as
 * AiDesignGenerations.designId, duplicated here for direct queries. Not
 * wired to any caller yet (depends on the "Publish to Catalog" flow
 * threading sourceGenerationId through, same open item as
 * ai-design-generations.ts's backfillDesignId()). */
export async function backfillDesignIdForCorrection(correctionId: string, designId: number): Promise<void> {
  await ensureTable();
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { correctionId: { S: correctionId } },
    UpdateExpression: 'SET designId = :d',
    ExpressionAttributeValues: { ':d': { N: String(designId) } },
  }));
}

// ── Orchestration — the actual "diff computed server-side" step ────────────

export interface ReviewGenerationParams {
  generationId: string;
  currentGrid: number[][];
  currentPalette: PatternPalette[];
  reasonTags?: string[];
  freeTextComment?: string;
}

export interface ReviewGenerationResult {
  correctionId: string;
  diff: GridDiffSummary;
  acceptedOrRejected: AcceptedOrRejected;
}

/**
 * Phase A of the real UI flow: diffs the pattern's current state against
 * the baseline for the round about to be reviewed — the end-state of the
 * PREVIOUS round if one exists (generation.lastReviewedGrid/Palette),
 * falling back to the immutable AI-generated snapshot for round 1. This
 * is what makes multiple rounds meaningful: round 2's diff shows only
 * what changed since round 1's correction, not the cumulative diff since
 * the AI's original output. Doesn't persist anything — the editor calls
 * this first so it can show the diff summary and ask "what were you
 * fixing" BEFORE writing a correction record with a reason that doesn't
 * exist yet. Returns null if the generation has no snapshot at all (e.g.
 * bad generationId, or attachDraft() never ran).
 */
export async function computeDiffForGeneration(
  generationId: string,
  currentGrid: number[][],
  currentPalette: PatternPalette[],
): Promise<GridDiffSummary | null> {
  const generation = await getGeneration(generationId);
  if (!generation || !generation.initialGrid || !generation.initialPalette) {
    console.error('[ai-design-corrections] generation not found or has no initial snapshot:', generationId);
    return null;
  }
  const baselineGrid = generation.lastReviewedGrid ?? generation.initialGrid;
  const baselinePalette = generation.lastReviewedPalette ?? generation.initialPalette;
  return diffPatterns(
    { grid: baselineGrid, palette: baselinePalette },
    { grid: currentGrid, palette: currentPalette },
  );
}

/**
 * Phase B: persists the correction record for an already-computed diff
 * (recomputing isn't needed — the diff itself doesn't depend on the
 * reason given for it), tagged with the next round number for this
 * generation, then advances the review baseline (recordReviewRound) so
 * the NEXT save's diff starts from here, not from the original AI output.
 * Deliberately does NOT mark the generation "reviewed" / stop offering
 * review — Olga's 2026-08-08 ask: every save on an AI-draft should offer
 * the review step, tracked as its own round, not just the first one.
 */
export async function submitReview(
  generationId: string,
  diff: GridDiffSummary,
  reasonTags: string[],
  freeTextComment: string | undefined,
  currentGrid: number[][],
  currentPalette: PatternPalette[],
): Promise<ReviewGenerationResult> {
  const acceptedOrRejected: AcceptedOrRejected = isEmptyDiff(diff) ? 'approve' : 'approve-with-changes';
  const roundNumber = (await listCorrectionsForGeneration(generationId)).length + 1;

  const correctionId = await saveCorrection({
    generationId,
    roundNumber,
    diff,
    // No reason tags/comment recorded for a true no-op approve, even if
    // the caller passed some — matches "no reason question is asked" for
    // that case.
    reasonTags: acceptedOrRejected === 'approve' ? [] : reasonTags,
    freeTextComment: acceptedOrRejected === 'approve' ? undefined : freeTextComment,
    acceptedOrRejected,
  });

  await recordReviewRound(generationId, { grid: currentGrid, palette: currentPalette });

  return { correctionId, diff, acceptedOrRejected };
}

/**
 * One-shot convenience wrapper combining phases A+B — useful when there's
 * no UI round-trip needed (e.g. a script/CLI caller that already knows
 * what reason, if any, to record). The real editor flow calls
 * computeDiffForGeneration() and submitReview() separately instead, so it
 * can show the diff before asking for a reason.
 */
export async function reviewGeneration(params: ReviewGenerationParams): Promise<ReviewGenerationResult | null> {
  const diff = await computeDiffForGeneration(params.generationId, params.currentGrid, params.currentPalette);
  if (!diff) return null;
  return submitReview(params.generationId, diff, params.reasonTags ?? [], params.freeTextComment, params.currentGrid, params.currentPalette);
}
