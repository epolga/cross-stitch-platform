import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  savePattern: vi.fn(),
  getSession:  vi.fn(),
}));

vi.mock('@/lib/pattern-storage', () => ({ savePattern: mocks.savePattern }));
vi.mock('@/lib/session',         () => ({ getSession:  mocks.getSession  }));

import { POST } from './route';

const VALID_BODY = {
  name:    'Horse',
  width:   2,
  height:  1,
  palette: [{ number: '666', name: 'Red', r: 200, g: 0, b: 0, symbol: 'X', stitchCount: 0 }],
  grid:    [[0, 0]],
};

function makeRequest(body: unknown, thumbnail?: string) {
  return new NextRequest('http://localhost/api/converter/patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(thumbnail !== undefined ? { ...body as object, thumbnail } : body),
  });
}

describe('POST /api/converter/patterns', () => {
  it('returns 401 when not logged in', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Login required' });
    expect(mocks.savePattern).not.toHaveBeenCalled();
  });

  it('returns 400 when grid is missing', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com' });
    const res = await POST(makeRequest({ ...VALID_BODY, grid: undefined }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when grid dimensions mismatch', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com' });
    const res = await POST(makeRequest({ ...VALID_BODY, height: 2 })); // height says 2 but grid has 1 row
    expect(res.status).toBe(400);
  });

  it('returns 400 when width is zero', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com' });
    const res = await POST(makeRequest({ ...VALID_BODY, width: 0 }));
    expect(res.status).toBe(400);
  });

  it('saves pattern and returns id on happy path', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com' });
    mocks.savePattern.mockResolvedValueOnce('new-pattern-id');

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'new-pattern-id' });
    expect(mocks.savePattern).toHaveBeenCalledWith(
      'Horse', 2, 1, VALID_BODY.palette, VALID_BODY.grid, 'u1', undefined, undefined,
    );
  });

  it('passes thumbnail to savePattern when provided', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com' });
    mocks.savePattern.mockResolvedValueOnce('new-pattern-id');
    const thumb = 'data:image/jpeg;base64,abc';

    await POST(makeRequest(VALID_BODY, thumb));
    expect(mocks.savePattern).toHaveBeenCalledWith(
      'Horse', 2, 1, VALID_BODY.palette, VALID_BODY.grid, 'u1', thumb, undefined,
    );
  });
});
