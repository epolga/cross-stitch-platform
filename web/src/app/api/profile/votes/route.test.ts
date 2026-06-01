import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  getUserDesignVotes: vi.fn(),
  getDesignById: vi.fn(),
}));

vi.mock('@/lib/design-likes', () => ({
  getUserDesignVotes: routeMocks.getUserDesignVotes,
}));

vi.mock('@/lib/data-access', () => ({
  getDesignById: routeMocks.getDesignById,
}));

import { GET } from './route';

describe('GET /api/profile/votes', () => {
  it('returns 401 when no email is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/votes');

    const response = await GET(request);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: 'Email is required' });
    expect(routeMocks.getUserDesignVotes).not.toHaveBeenCalled();
  });

  it('returns only count when includeDesigns is false', async () => {
    routeMocks.getUserDesignVotes.mockResolvedValueOnce([
      { designId: 15, voteDirection: 'up', updatedAt: '2026-03-22T10:00:00.000Z' },
      { designId: 9, voteDirection: 'down', updatedAt: '2026-03-21T10:00:00.000Z' },
    ]);

    const request = new NextRequest(
      'http://localhost:3000/api/profile/votes?includeDesigns=false&email=ignored@example.com',
      {
        headers: {
          'x-user-email': ' Ann@Example.com ',
        },
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as { email: string; votesCount: number };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      email: 'ann@example.com',
      votesCount: 2,
    });
    expect(routeMocks.getUserDesignVotes).toHaveBeenCalledWith('ann@example.com');
    expect(routeMocks.getDesignById).not.toHaveBeenCalled();
  });

  it('hydrates designs and filters out missing ones', async () => {
    routeMocks.getUserDesignVotes.mockResolvedValueOnce([
      { designId: 15, voteDirection: 'up', updatedAt: '2026-03-22T10:00:00.000Z' },
      { designId: 9, voteDirection: 'down', updatedAt: '2026-03-21T10:00:00.000Z' },
    ]);
    routeMocks.getDesignById.mockImplementation(async (designId: number) => {
      if (designId === 15) {
        return {
          DesignID: 15,
          AlbumID: 2,
          Caption: 'Red Heart Sampler',
          Description: 'A floral sampler.',
          NColors: 8,
          NDownloaded: 10,
          Width: 100,
          Height: 120,
          Notes: '',
          Text: '',
          NPage: 3,
          ImageUrl: 'https://example.com/15.jpg',
          PdfUrl: 'https://example.com/15.pdf',
          PinterestPinId: null,
          PinterestPinUrl: null,
          NGlobalPage: 1,
        };
      }

      return undefined;
    });

    const request = new NextRequest('http://localhost:3000/api/profile/votes?email=ann@example.com');

    const response = await GET(request);
    const payload = (await response.json()) as {
      email: string;
      votesCount: number;
      votes: Array<{ designId: number; voteDirection: 'up' | 'down'; design: { DesignID: number; Caption: string } }>;
    };

    expect(response.status).toBe(200);
    expect(payload.email).toBe('ann@example.com');
    expect(payload.votesCount).toBe(2);
    expect(payload.votes).toEqual([
      {
        designId: 15,
        voteDirection: 'up',
        updatedAt: '2026-03-22T10:00:00.000Z',
        design: expect.objectContaining({
          DesignID: 15,
          Caption: 'Red Heart Sampler',
        }),
      },
    ]);
    expect(routeMocks.getDesignById).toHaveBeenCalledTimes(2);
    expect(routeMocks.getDesignById).toHaveBeenNthCalledWith(1, 15);
    expect(routeMocks.getDesignById).toHaveBeenNthCalledWith(2, 9);
  });
});