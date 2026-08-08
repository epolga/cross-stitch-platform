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
}): Promise<string> {
  await ensureTable();
  const generationId = randomUUID();
  const now = new Date().toISOString();

  await client.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
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
    },
  }));

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
 * Step 3 (not wired to any caller yet — the Approve/publish UI this feeds
 * doesn't exist): marks a generation reviewed so the (future) Approve step
 * doesn't re-ask on every subsequent normal save.
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
