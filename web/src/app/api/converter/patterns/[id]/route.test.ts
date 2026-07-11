import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  loadPattern:   vi.fn(),
  updatePattern: vi.fn(),
  getSession:    vi.fn(),
}));

vi.mock('@/lib/pattern-storage', () => ({
  loadPattern:   mocks.loadPattern,
  updatePattern: mocks.updatePattern,
}));
vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));

import { GET, PUT } from './route';

// Must be a valid UUID format to pass the route's regex guard.
const VALID_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PATTERN = {
  id:        VALID_ID,
  name:      'Horse',
  width:     2,
  height:    1,
  palette:   [{ number: '666', name: 'Red', r: 200, g: 0, b: 0, symbol: 'X', stitchCount: 0 }],
  grid:      [[0, 0]],
  createdAt: '2026-06-27T10:00:00.000Z',
  ownerID:   'owner-u1',
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeGetRequest(id: string) {
  return new NextRequest(`http://localhost/api/converter/patterns/${id}`);
}

function makePutRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/converter/patterns/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: 'Horse Updated', width: 2, height: 1,
  palette: PATTERN.palette, grid: PATTERN.grid,
};

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/converter/patterns/[id]', () => {
  it('returns 400 for an invalid id format', async () => {
    const res = await GET(makeGetRequest('not-a-uuid'), makeParams('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when pattern does not exist', async () => {
    mocks.loadPattern.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(404);
  });

  it('returns 403 when session user is not the owner', async () => {
    mocks.loadPattern.mockResolvedValueOnce({ ...PATTERN });
    mocks.getSession.mockResolvedValueOnce({ userId: 'other-user', email: 'x@y.com' });
    const res = await GET(makeGetRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(403);
  });

  it('returns 200 with pattern data for the correct owner', async () => {
    mocks.loadPattern.mockResolvedValueOnce({ ...PATTERN });
    mocks.getSession.mockResolvedValueOnce({ userId: 'owner-u1', email: 'a@b.com' });
    const res = await GET(makeGetRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(200);
    expect((await res.json() as typeof PATTERN).name).toBe('Horse');
  });

  it('returns 200 for a public pattern (no ownerID) without a session', async () => {
    mocks.loadPattern.mockResolvedValueOnce({ ...PATTERN, ownerID: undefined });
    const res = await GET(makeGetRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(200);
  });
});

// ── PUT ───────────────────────────────────────────────────────────────────────

describe('PUT /api/converter/patterns/[id]', () => {
  it('returns 400 for an invalid id format', async () => {
    const res = await PUT(makePutRequest('bad-id', VALID_BODY), makeParams('bad-id'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when not logged in', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await PUT(makePutRequest(VALID_ID, VALID_BODY), makeParams(VALID_ID));
    expect(res.status).toBe(401);
  });

  it('returns 404 when pattern does not exist', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'owner-u1', email: 'a@b.com' });
    mocks.loadPattern.mockResolvedValueOnce(null);
    const res = await PUT(makePutRequest(VALID_ID, VALID_BODY), makeParams(VALID_ID));
    expect(res.status).toBe(404);
  });

  it('returns 403 when session user is not the owner', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'intruder', email: 'x@y.com' });
    mocks.loadPattern.mockResolvedValueOnce({ ...PATTERN });
    const res = await PUT(makePutRequest(VALID_ID, VALID_BODY), makeParams(VALID_ID));
    expect(res.status).toBe(403);
  });

  it('returns 200 and calls updatePattern on happy path', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'owner-u1', email: 'a@b.com' });
    mocks.loadPattern.mockResolvedValueOnce({ ...PATTERN });
    mocks.updatePattern.mockResolvedValueOnce(undefined);

    const res = await PUT(makePutRequest(VALID_ID, VALID_BODY), makeParams(VALID_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: VALID_ID });
    expect(mocks.updatePattern).toHaveBeenCalledWith(
      VALID_ID, 'Horse Updated', 2, 1, VALID_BODY.palette, VALID_BODY.grid, 'owner-u1', undefined, undefined,
    );
  });

  it('passes thumbnail through to updatePattern', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'owner-u1', email: 'a@b.com' });
    mocks.loadPattern.mockResolvedValueOnce({ ...PATTERN });
    mocks.updatePattern.mockResolvedValueOnce(undefined);
    const thumb = 'data:image/jpeg;base64,xyz';

    await PUT(makePutRequest(VALID_ID, { ...VALID_BODY, thumbnail: thumb }), makeParams(VALID_ID));
    expect(mocks.updatePattern).toHaveBeenCalledWith(
      VALID_ID, 'Horse Updated', 2, 1, VALID_BODY.palette, VALID_BODY.grid, 'owner-u1', thumb, undefined,
    );
  });
});
