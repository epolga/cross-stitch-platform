import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  listPatternsByOwner: vi.fn(),
  getSession:          vi.fn(),
}));

vi.mock('@/lib/pattern-storage', () => ({ listPatternsByOwner: mocks.listPatternsByOwner }));
vi.mock('@/lib/session',         () => ({ getSession:           mocks.getSession          }));

import { GET } from './route';

function makeRequest() {
  return new NextRequest('http://localhost/api/converter/patterns/my');
}

const SUMMARIES = [
  { id: 'id-1', name: 'Horse', width: 40, height: 30, createdAt: '2026-06-27T10:00:00.000Z', thumbnail: 'data:image/jpeg;base64,abc' },
  { id: 'id-2', name: 'Flower', width: 20, height: 15, createdAt: '2026-06-01T10:00:00.000Z' },
];

describe('GET /api/converter/patterns/my', () => {
  it('returns 401 when not logged in', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Login required' });
    expect(mocks.listPatternsByOwner).not.toHaveBeenCalled();
  });

  it('returns the owner\'s pattern list on happy path', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'user-u1', email: 'a@b.com' });
    mocks.listPatternsByOwner.mockResolvedValueOnce(SUMMARIES);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { patterns: typeof SUMMARIES };
    expect(body.patterns).toEqual(SUMMARIES);
    expect(mocks.listPatternsByOwner).toHaveBeenCalledWith('user-u1');
  });

  it('returns an empty array when user has no patterns', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'user-u1', email: 'a@b.com' });
    mocks.listPatternsByOwner.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect((await res.json() as { patterns: unknown[] }).patterns).toEqual([]);
  });

  it('returns 500 when the storage layer throws', async () => {
    mocks.getSession.mockResolvedValueOnce({ userId: 'user-u1', email: 'a@b.com' });
    mocks.listPatternsByOwner.mockRejectedValueOnce(new Error('DDB timeout'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
