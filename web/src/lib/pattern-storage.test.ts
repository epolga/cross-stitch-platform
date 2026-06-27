import { beforeAll, describe, expect, it, vi } from 'vitest';

// ── DDB mock ──────────────────────────────────────────────────────────────────
// DynamoDBClient is used with `new`, so the mock must be a real constructor.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-dynamodb')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DynamoDBClient: vi.fn(function (this: any) { this.send = mockSend; }),
  };
});

import {
  DescribeTableCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import {
  rleEncode,
  rleDecode,
  savePattern,
  updatePattern,
  listPatternsByOwner,
} from './pattern-storage';
import type { PatternPalette } from './pattern-converter';

const RED: PatternPalette = { number: '666', name: 'Red', r: 200, g: 0, b: 0, symbol: 'X', stitchCount: 0 };

beforeAll(() => {
  // Default: ACTIVE table; writes and queries succeed with empty results.
  mockSend.mockImplementation(async (cmd: unknown) => {
    if (cmd instanceof DescribeTableCommand) return { Table: { TableStatus: 'ACTIVE' } };
    if (cmd instanceof PutItemCommand)       return {};
    if (cmd instanceof QueryCommand)         return { Items: [] };
    return {};
  });
});

// ── RLE codec ─────────────────────────────────────────────────────────────────

describe('rleEncode / rleDecode', () => {
  it('roundtrips a simple grid', () => {
    const grid = [[0, 0, 1], [1, 2, 2]];
    expect(rleDecode(rleEncode(grid), 3, 2)).toEqual(grid);
  });

  it('compresses a uniform grid to a single run', () => {
    const grid = Array.from({ length: 10 }, () => Array(10).fill(3));
    expect(rleEncode(grid)).toBe('100:3');
    expect(rleDecode('100:3', 10, 10)).toEqual(grid);
  });

  it('handles empty cells (-1)', () => {
    const grid = [[-1, 0, -1]];
    expect(rleDecode(rleEncode(grid), 3, 1)).toEqual(grid);
  });

  it('returns empty string for an empty grid', () => {
    expect(rleEncode([])).toBe('');
  });
});

// ── savePattern ───────────────────────────────────────────────────────────────

describe('savePattern', () => {
  it('writes a DDB item with the correct fields', async () => {
    const id = await savePattern('My Pattern', 2, 1, [RED], [[0, 0]], 'user-abc');

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    const item = (call![0] as PutItemCommand).input.Item!;
    expect(item.patternId.S).toBe(id);
    expect(item.name.S).toBe('My Pattern');
    expect(item.width.N).toBe('2');
    expect(item.height.N).toBe('1');
    expect(item.ownerID.S).toBe('user-abc');
    expect(item.thumbnail).toBeUndefined();
  });

  it('includes thumbnail when provided', async () => {
    await savePattern('With Thumb', 1, 1, [RED], [[0]], 'user-abc', 'data:image/jpeg;base64,abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.thumbnail?.S).toBe('data:image/jpeg;base64,abc');
  });

  it('falls back to Untitled for a blank name', async () => {
    await savePattern('   ', 1, 1, [RED], [[0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.name.S).toBe('Untitled');
  });
});

// ── updatePattern ─────────────────────────────────────────────────────────────

describe('updatePattern', () => {
  it('writes a PutItemCommand with the given id', async () => {
    await updatePattern('fixed-id', 'Updated', 2, 1, [RED], [[0, 0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    const item = (call![0] as PutItemCommand).input.Item!;
    expect(item.patternId.S).toBe('fixed-id');
    expect(item.name.S).toBe('Updated');
  });

  it('omits thumbnail when not provided', async () => {
    await updatePattern('fixed-id', 'No Thumb', 1, 1, [RED], [[0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.thumbnail).toBeUndefined();
  });
});

// ── listPatternsByOwner ───────────────────────────────────────────────────────

describe('listPatternsByOwner', () => {
  it('queries the ownerID-index GSI with the correct key', async () => {
    mockSend.mockImplementationOnce(async () => ({ Items: [] }));

    await listPatternsByOwner('user-xyz');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof QueryCommand);
    const input = (call![0] as QueryCommand).input;
    expect(input.IndexName).toBe('ownerID-index');
    expect(input.ExpressionAttributeValues![':oid'].S).toBe('user-xyz');
  });

  it('maps items to PatternSummary shape and sorts newest first', async () => {
    mockSend.mockImplementationOnce(async () => ({
      Items: [
        { patternId: { S: 'id-b' }, name: { S: 'Horse' },  width: { N: '40' }, height: { N: '30' }, createdAt: { S: '2026-06-01T10:00:00.000Z' }, thumbnail: { S: 'data:image/jpeg;base64,abc' } },
        { patternId: { S: 'id-a' }, name: { S: 'Flower' }, width: { N: '20' }, height: { N: '15' }, createdAt: { S: '2026-06-27T10:00:00.000Z' } },
      ],
    }));

    const results = await listPatternsByOwner('user-xyz');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('id-a');       // newest first
    expect(results[0].thumbnail).toBeUndefined();
    expect(results[1].id).toBe('id-b');
    expect(results[1].thumbnail).toBe('data:image/jpeg;base64,abc');
  });

  it('returns empty array when user has no patterns', async () => {
    mockSend.mockImplementationOnce(async () => ({ Items: [] }));
    expect(await listPatternsByOwner('nobody')).toEqual([]);
  });
});
