// Track 2 (Opportunity 9) — persists one row per trend-detection +
// image-generation attempt, per the schema designed in
// docs/genai-growth/DESIGN_FEEDBACK_LOOP.md's "Data store and provenance
// tracking" section. Two purposes:
//   1. Ties imagePrompt -> eventual designId -> that design's real
//      NDownloaded, for the prompt-composition -> downloads measurement
//      Olga asked for.
//   2. Holds the immutable "as-generated" grid/palette snapshot, written
//      once at draft-save time before Olga can ever edit it — the
//      provenance mechanism DESIGN_FEEDBACK_LOOP.md's open questions #3/#4
//      needed to compute a before/after diff later.
// Self-provisioning table, same pattern as search-engagement.ts.

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  GetItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import type { PatternPalette } from './pattern-converter';
import type { GroundingAssessment } from './trend-detection';
import { rleEncode, rleDecode } from './rle';

const TABLE = process.env.DDB_AI_DESIGN_GENERATIONS_TABLE || 'AiDesignGenerations';
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
            KeySchema: [{ AttributeName: 'generationId', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'generationId', AttributeType: 'S' }],
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

export type GenerationStatus = 'generated' | 'draft-saved' | 'reviewed' | 'published' | 'rejected';

export interface AiDesignGeneration {
  generationId: string;
  theme: string;
  imagePrompt: string;
  signalSource: string;
  reasoning: string;
  groundingPassesGate: boolean;
  groundingCitedDomains: string[];
  imageProvider: string;
  status: GenerationStatus;
  createdAt: string;
  patternId?: string;
  designId?: number;
  initialGrid?: number[][];
  initialPalette?: PatternPalette[];
  // Added 2026-08-08 — detectTrend()'s researched popular size (stitches)
  // and color combination for this theme, kept for provenance/measurement
  // even though targetHeight isn't fully honored by the conversion step
  // yet (see save-ai-draft.ts). Optional: absent for generations created
  // before this field existed, or for a manual/non-AI-trend save.
  targetWidth?: number;
  targetHeight?: number;
  colorPalette?: string;
  // Added 2026-08-08 (Olga's ask, real multi-round review): the state as of
  // the END of the most recently submitted review round — distinct from
  // initialGrid/initialPalette, which stay frozen at the AI's original
  // output forever. Each round's diff compares against THIS, not the
  // original snapshot, so round 2's diff shows only what changed in round
  // 2, not the cumulative diff since generation. Absent until the first
  // review round completes, at which point computeDiffForGeneration()
  // falls back to initialGrid/initialPalette.
  lastReviewedGrid?: number[][];
  lastReviewedPalette?: PatternPalette[];
}

/**
 * Step 1: called right after detectTrend() returns, before image
 * generation even runs — so the prompt/theme/grounding data survives even
 * if a later pipeline step (image gen, conversion) fails.
 */
export async function createGeneration(params: {
  theme: string;
  imagePrompt: string;
  signalSource: string;
  reasoning: string;
  grounding: GroundingAssessment;
  imageProvider: string;
  targetWidth?: number;
  targetHeight?: number;
  colorPalette?: string;
}): Promise<string> {
  await ensureTable();
  const generationId = randomUUID();
  const now = new Date().toISOString();

  const item: Record<string, AttributeValue> = {
    generationId: { S: generationId },
    theme: { S: params.theme },
    imagePrompt: { S: params.imagePrompt },
    signalSource: { S: params.signalSource },
    reasoning: { S: params.reasoning },
    groundingPassesGate: { BOOL: params.grounding.passesGate },
    groundingCitedDomains: { S: JSON.stringify(params.grounding.citedDomains) },
    imageProvider: { S: params.imageProvider },
    status: { S: 'generated' satisfies GenerationStatus },
    createdAt: { S: now },
  };
  if (params.targetWidth !== undefined) item.targetWidth = { N: String(params.targetWidth) };
  if (params.targetHeight !== undefined) item.targetHeight = { N: String(params.targetHeight) };
  if (params.colorPalette !== undefined) item.colorPalette = { S: params.colorPalette };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));

  return generationId;
}

/**
 * Step 2: called once the pattern is first saved (ConverterPatterns row
 * created). Writes the immutable "as-generated" snapshot — never touched
 * again after this, even though the ConverterPatterns row it points at
 * (via patternId) will be freely edited afterward.
 */
export async function attachDraft(
  generationId: string,
  params: { patternId: string; initialGrid: number[][]; initialPalette: PatternPalette[] },
): Promise<void> {
  await ensureTable();
  const height = params.initialGrid.length;
  const width = params.initialGrid[0]?.length ?? 0;

  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { generationId: { S: generationId } },
    UpdateExpression: 'SET patternId = :p, initialGrid = :g, initialWidth = :w, initialHeight = :h, initialPalette = :pal, #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':p': { S: params.patternId },
      ':g': { S: rleEncode(params.initialGrid) },
      ':w': { N: String(width) },
      ':h': { N: String(height) },
      ':pal': { S: JSON.stringify(params.initialPalette) },
      ':status': { S: 'draft-saved' satisfies GenerationStatus },
    },
  }));
}

/**
 * Step 3, original one-shot design: marks a generation reviewed so the
 * Approve step doesn't re-ask on every subsequent normal save. Kept but
 * NOT called by the real review flow anymore (see recordReviewRound()
 * below) — Olga's 2026-08-08 ask was the opposite of "ask once": every
 * save on an AI-draft should offer review, tracked as its own round.
 * Left in place as a still-valid building block for a possible future
 * explicit "I'm done reviewing this one" action.
 */
export async function markReviewed(generationId: string): Promise<void> {
  await ensureTable();
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { generationId: { S: generationId } },
    UpdateExpression: 'SET #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': { S: 'reviewed' satisfies GenerationStatus } },
  }));
}

/**
 * Called after EVERY review round completes (both "approve, no changes"
 * and "approve with changes") — advances the baseline computeDiffForGeneration()
 * diffs against for the NEXT round, so each round's diff reflects only
 * what changed since the previous round, not the cumulative diff since
 * the AI's original output. Deliberately does NOT touch `status` — status
 * stays 'draft-saved' so needsAiReview keeps offering review on every
 * future save, per Olga's explicit multi-round request.
 */
export async function recordReviewRound(
  generationId: string,
  params: { grid: number[][]; palette: PatternPalette[] },
): Promise<void> {
  await ensureTable();
  const height = params.grid.length;
  const width = params.grid[0]?.length ?? 0;

  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { generationId: { S: generationId } },
    UpdateExpression: 'SET lastReviewedGrid = :g, lastReviewedWidth = :w, lastReviewedHeight = :h, lastReviewedPalette = :pal',
    ExpressionAttributeValues: {
      ':g': { S: rleEncode(params.grid) },
      ':w': { N: String(width) },
      ':h': { N: String(height) },
      ':pal': { S: JSON.stringify(params.palette) },
    },
  }));
}

/**
 * Step 4 (not wired to any caller yet — depends on threading
 * sourceGenerationId through the existing "Publish to Catalog" flow):
 * backfills the resulting catalog designId once the pattern is published,
 * the join key for the prompt/corrections -> NDownloaded measurement.
 */
export async function backfillDesignId(generationId: string, designId: number): Promise<void> {
  await ensureTable();
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { generationId: { S: generationId } },
    UpdateExpression: 'SET designId = :d, #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':d': { N: String(designId) },
      ':status': { S: 'published' satisfies GenerationStatus },
    },
  }));
}

function itemToRecord(item: Record<string, AttributeValue>): AiDesignGeneration {
  const width = item.initialWidth?.N ? parseInt(item.initialWidth.N, 10) : undefined;
  const height = item.initialHeight?.N ? parseInt(item.initialHeight.N, 10) : undefined;
  const lastReviewedWidth = item.lastReviewedWidth?.N ? parseInt(item.lastReviewedWidth.N, 10) : undefined;
  const lastReviewedHeight = item.lastReviewedHeight?.N ? parseInt(item.lastReviewedHeight.N, 10) : undefined;
  return {
    generationId: item.generationId.S!,
    theme: item.theme?.S ?? '',
    imagePrompt: item.imagePrompt?.S ?? '',
    signalSource: item.signalSource?.S ?? '',
    reasoning: item.reasoning?.S ?? '',
    groundingPassesGate: item.groundingPassesGate?.BOOL ?? false,
    groundingCitedDomains: item.groundingCitedDomains?.S ? JSON.parse(item.groundingCitedDomains.S) : [],
    imageProvider: item.imageProvider?.S ?? '',
    status: (item.status?.S as GenerationStatus) ?? 'generated',
    createdAt: item.createdAt?.S ?? '',
    patternId: item.patternId?.S,
    designId: item.designId?.N ? parseInt(item.designId.N, 10) : undefined,
    initialGrid: item.initialGrid?.S && width && height ? rleDecode(item.initialGrid.S, width, height) : undefined,
    initialPalette: item.initialPalette?.S ? JSON.parse(item.initialPalette.S) : undefined,
    targetWidth: item.targetWidth?.N ? parseInt(item.targetWidth.N, 10) : undefined,
    targetHeight: item.targetHeight?.N ? parseInt(item.targetHeight.N, 10) : undefined,
    colorPalette: item.colorPalette?.S,
    lastReviewedGrid: item.lastReviewedGrid?.S && lastReviewedWidth && lastReviewedHeight
      ? rleDecode(item.lastReviewedGrid.S, lastReviewedWidth, lastReviewedHeight) : undefined,
    lastReviewedPalette: item.lastReviewedPalette?.S ? JSON.parse(item.lastReviewedPalette.S) : undefined,
  };
}

export async function getGeneration(generationId: string): Promise<AiDesignGeneration | null> {
  await ensureTable();
  const { Item } = await client.send(new GetItemCommand({
    TableName: TABLE,
    Key: { generationId: { S: generationId } },
  }));
  if (!Item) return null;
  return itemToRecord(Item);
}
