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

// ── S3 mock ───────────────────────────────────────────────────────────────────
// storeThumbnail() (pattern-storage.ts) uploads to S3 on any save/update that
// carries a data-URI thumbnail — without this mock, these tests would fire
// real PutObjectCommand calls at AWS.
const { mockS3Send } = vi.hoisted(() => ({ mockS3Send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    S3Client: vi.fn(function (this: any) { this.send = mockS3Send; }),
  };
});

import {
  DescribeTableCommand,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  GetItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  rleEncode,
  rleDecode,
  savePattern,
  updatePattern,
  deletePattern,
  listPatternsByOwner,
} from './pattern-storage';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { PatternPalette } from './pattern-converter';

const RED: PatternPalette = { number: '666', name: 'Red', r: 200, g: 0, b: 0, symbol: 'X', stitchCount: 0 };

beforeAll(() => {
  // Default: ACTIVE table; writes and queries succeed with empty results.
  mockSend.mockImplementation(async (cmd: unknown) => {
    if (cmd instanceof DescribeTableCommand) return { Table: { TableStatus: 'ACTIVE' } };
    if (cmd instanceof PutItemCommand)       return {};
    if (cmd instanceof UpdateItemCommand)    return {};
    if (cmd instanceof DeleteItemCommand)    return {};
    if (cmd instanceof GetItemCommand)       return { Item: undefined };
    if (cmd instanceof QueryCommand)         return { Items: [] };
    return {};
  });
  // Default: every S3 upload succeeds.
  mockS3Send.mockImplementation(async () => ({}));
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

  it('sets createdAt and modifiedAt to the same value on first save', async () => {
    await savePattern('Fresh', 1, 1, [RED], [[0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    const item = (call![0] as PutItemCommand).input.Item!;
    expect(item.createdAt.S).toBeTruthy();
    expect(item.modifiedAt.S).toBe(item.createdAt.S);
  });

  it('uploads a data-URI thumbnail to S3 and stores the key, not the raw data URI', async () => {
    const id = await savePattern('With Thumb', 1, 1, [RED], [[0]], 'user-abc', 'data:image/jpeg;base64,abc');

    const expectedKey = `photos/converter-patterns/${id}.jpg`;
    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.thumbnail?.S).toBe(expectedKey);
    const s3Call = mockS3Send.mock.calls.findLast((c) => c[0] instanceof PutObjectCommand);
    expect((s3Call![0] as PutObjectCommand).input.Key).toBe(expectedKey);
    expect((s3Call![0] as PutObjectCommand).input.Bucket).toBe('cross-stitch-designs');
  });

  it('saves without a thumbnail if the S3 upload fails, instead of blocking the save', async () => {
    mockS3Send.mockImplementationOnce(async () => { throw new Error('S3 down'); });

    const id = await savePattern('Thumb Fails', 1, 1, [RED], [[0]], 'user-abc', 'data:image/jpeg;base64,abc');

    expect(id).toMatch(/^[0-9a-f-]{36}$/); // save still succeeded
    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.thumbnail).toBeUndefined();
  });

  it('passes an already-migrated thumbnail key through unchanged, without touching S3', async () => {
    mockS3Send.mockClear();
    const existingKey = 'photos/converter-patterns/some-other-id.png';

    await savePattern('Already Migrated', 1, 1, [RED], [[0]], 'user-abc', existingKey);

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.thumbnail?.S).toBe(existingKey);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('falls back to Untitled for a blank name', async () => {
    await savePattern('   ', 1, 1, [RED], [[0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.name.S).toBe('Untitled');
  });

  it('includes sourceImageMaskKey only when provided', async () => {
    await savePattern(
      'Masked', 1, 1, [RED], [[0]], 'user-abc',
      undefined, undefined, undefined, undefined,
      'pattern-source-images/2026-08-13/x.jpg', 'pattern-source-images/2026-08-13/x.mask.png',
    );

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof PutItemCommand);
    expect((call![0] as PutItemCommand).input.Item!.sourceImageMaskKey?.S).toBe('pattern-source-images/2026-08-13/x.mask.png');
  });
});

// ── updatePattern ─────────────────────────────────────────────────────────────

describe('updatePattern', () => {
  it('writes an UpdateItemCommand (not a full Put) with the given id, and never touches createdAt', async () => {
    await updatePattern('fixed-id', 'Updated', 2, 1, [RED], [[0, 0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof UpdateItemCommand);
    const input = (call![0] as UpdateItemCommand).input;
    expect(input.Key!.patternId.S).toBe('fixed-id');
    expect(input.ExpressionAttributeValues![':n'].S).toBe('Updated');
    expect(input.UpdateExpression).not.toContain('createdAt');
    expect(input.UpdateExpression).toContain('modifiedAt = :m');
  });

  it('REMOVEs thumbnail and hiddenColors when not provided', async () => {
    await updatePattern('fixed-id', 'No Thumb', 1, 1, [RED], [[0]], 'user-abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof UpdateItemCommand);
    const input = (call![0] as UpdateItemCommand).input;
    expect(input.UpdateExpression).toContain('REMOVE thumbnail, hiddenColors');
    expect(input.ExpressionAttributeValues![':t']).toBeUndefined();
  });

  it('SETs thumbnail (as an S3 key, not the raw data URI) and hiddenColors when provided', async () => {
    await updatePattern('fixed-id', 'With Extras', 1, 1, [RED], [[0]], 'user-abc', 'data:image/jpeg;base64,abc', [1, 2]);

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof UpdateItemCommand);
    const input = (call![0] as UpdateItemCommand).input;
    expect(input.UpdateExpression).toContain('thumbnail = :t');
    expect(input.UpdateExpression).toContain('hiddenColors = :hc');
    expect(input.ExpressionAttributeValues![':t'].S).toBe('photos/converter-patterns/fixed-id.jpg');
  });

  it('leaves an existing thumbnail untouched (neither SET nor REMOVE) if the S3 upload fails', async () => {
    mockS3Send.mockImplementationOnce(async () => { throw new Error('S3 down'); });

    await updatePattern('fixed-id', 'Thumb Fails', 1, 1, [RED], [[0]], 'user-abc', 'data:image/jpeg;base64,abc');

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof UpdateItemCommand);
    const input = (call![0] as UpdateItemCommand).input;
    expect(input.UpdateExpression).not.toContain('thumbnail = :t');
    expect(input.UpdateExpression).not.toContain('REMOVE thumbnail');
    expect(input.ExpressionAttributeValues![':t']).toBeUndefined();
  });

  it('SETs sourceImageMaskKey when provided, and never REMOVEs it (only-set rule)', async () => {
    await updatePattern(
      'fixed-id', 'Masked', 1, 1, [RED], [[0]], 'user-abc',
      undefined, undefined, undefined,
      'pattern-source-images/2026-08-13/x.jpg', 'pattern-source-images/2026-08-13/x.mask.png',
    );

    const call = mockSend.mock.calls.findLast((c) => c[0] instanceof UpdateItemCommand);
    const input = (call![0] as UpdateItemCommand).input;
    expect(input.UpdateExpression).toContain('sourceImageMaskKey = :skm');
    expect(input.UpdateExpression).not.toContain('REMOVE sourceImageMaskKey');
    expect(input.ExpressionAttributeValues![':skm'].S).toBe('pattern-source-images/2026-08-13/x.mask.png');
  });
});

// ── deletePattern ─────────────────────────────────────────────────────────────

// Minimal well-formed GetItem response so loadPattern() (called internally
// by deletePattern() to find the thumbnail key) doesn't throw on missing
// required fields.
function ddbPatternItem(overrides: Record<string, unknown> = {}) {
  return {
    patternId:  { S: 'fixed-id' },
    name:       { S: 'Some Pattern' },
    width:      { N: '1' },
    height:     { N: '1' },
    palette:    { S: JSON.stringify([RED]) },
    grid:       { S: '1:0' },
    createdAt:  { S: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

describe('deletePattern', () => {
  it('deletes the thumbnail from S3 (using the stored key) before deleting the DDB item', async () => {
    mockSend.mockImplementationOnce(async () => ({
      Item: ddbPatternItem({ thumbnail: { S: 'photos/converter-patterns/fixed-id.jpg' } }),
    }));

    await deletePattern('fixed-id');

    const s3Call = mockS3Send.mock.calls.findLast((c) => c[0] instanceof DeleteObjectCommand);
    expect((s3Call![0] as DeleteObjectCommand).input.Bucket).toBe('cross-stitch-designs');
    expect((s3Call![0] as DeleteObjectCommand).input.Key).toBe('photos/converter-patterns/fixed-id.jpg');
    const ddbCall = mockSend.mock.calls.findLast((c) => c[0] instanceof DeleteItemCommand);
    expect((ddbCall![0] as DeleteItemCommand).input.Key!.patternId.S).toBe('fixed-id');
  });

  it('skips the S3 delete when the pattern has no thumbnail, but still deletes the DDB item', async () => {
    mockS3Send.mockClear();
    mockSend.mockImplementationOnce(async () => ({ Item: ddbPatternItem() })); // no thumbnail field

    await deletePattern('fixed-id');

    expect(mockS3Send).not.toHaveBeenCalled();
    const ddbCall = mockSend.mock.calls.findLast((c) => c[0] instanceof DeleteItemCommand);
    expect((ddbCall![0] as DeleteItemCommand).input.Key!.patternId.S).toBe('fixed-id');
  });

  it('still deletes the DDB item even if the S3 thumbnail delete fails', async () => {
    mockSend.mockImplementationOnce(async () => ({
      Item: ddbPatternItem({ thumbnail: { S: 'photos/converter-patterns/fixed-id.jpg' } }),
    }));
    mockS3Send.mockImplementationOnce(async () => { throw new Error('S3 down'); });

    await expect(deletePattern('fixed-id')).resolves.not.toThrow();

    const ddbCall = mockSend.mock.calls.findLast((c) => c[0] instanceof DeleteItemCommand);
    expect((ddbCall![0] as DeleteItemCommand).input.Key!.patternId.S).toBe('fixed-id');
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

  it('maps items to PatternSummary shape and sorts by modifiedAt, most recent first', async () => {
    mockSend.mockImplementationOnce(async () => ({
      Items: [
        { patternId: { S: 'id-b' }, name: { S: 'Horse' },  width: { N: '40' }, height: { N: '30' }, createdAt: { S: '2026-06-01T10:00:00.000Z' }, modifiedAt: { S: '2026-06-01T10:00:00.000Z' }, thumbnail: { S: 'data:image/jpeg;base64,abc' } },
        { patternId: { S: 'id-a' }, name: { S: 'Flower' }, width: { N: '20' }, height: { N: '15' }, createdAt: { S: '2026-06-27T10:00:00.000Z' }, modifiedAt: { S: '2026-06-27T10:00:00.000Z' } },
      ],
    }));

    const results = await listPatternsByOwner('user-xyz');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('id-a');       // most recently modified first
    expect(results[0].thumbnail).toBeUndefined();
    expect(results[1].id).toBe('id-b');
    expect(results[1].thumbnail).toBe('data:image/jpeg;base64,abc');
  });

  it('an old pattern created before modifiedAt existed still sorts correctly, falling back to createdAt', async () => {
    mockSend.mockImplementationOnce(async () => ({
      Items: [
        // Pre-migration row: no modifiedAt attribute at all.
        { patternId: { S: 'id-old' }, name: { S: 'Old' }, width: { N: '10' }, height: { N: '10' }, createdAt: { S: '2026-06-01T10:00:00.000Z' } },
        { patternId: { S: 'id-new' }, name: { S: 'New' }, width: { N: '10' }, height: { N: '10' }, createdAt: { S: '2026-05-01T10:00:00.000Z' }, modifiedAt: { S: '2026-07-01T10:00:00.000Z' } },
      ],
    }));

    const results = await listPatternsByOwner('user-xyz');
    expect(results.find(r => r.id === 'id-old')!.modifiedAt).toBe('2026-06-01T10:00:00.000Z');
    expect(results[0].id).toBe('id-new'); // real modifiedAt (07-01) beats old row's fallback (06-01)
  });

  it('returns empty array when user has no patterns', async () => {
    mockSend.mockImplementationOnce(async () => ({ Items: [] }));
    expect(await listPatternsByOwner('nobody')).toEqual([]);
  });
});
