import { NextRequest, NextResponse } from 'next/server';
import { getDesignById } from '@/lib/data-access';
import { getUserDesignVotes } from '@/lib/design-likes';

function readEmailFromRequest(request: NextRequest): string {
  const queryEmail = request.nextUrl.searchParams.get('email') || '';
  const headerEmail = request.headers.get('x-user-email') || '';
  return (headerEmail || queryEmail).trim().toLowerCase();
}

function shouldIncludeDesigns(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('includeDesigns') !== 'false';
}

export async function GET(request: NextRequest) {
  const email = readEmailFromRequest(request);
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 401 });
  }

  try {
    const votes = await getUserDesignVotes(email);

    if (!shouldIncludeDesigns(request)) {
      return NextResponse.json(
        {
          email,
          votesCount: votes.length,
        },
        { status: 200 },
      );
    }

    const votesWithDesigns = await Promise.all(
      votes.map(async (vote) => {
        const design = await getDesignById(vote.designId);
        if (!design) {
          return null;
        }

        return {
          ...vote,
          design,
        };
      }),
    );

    return NextResponse.json(
      {
        email,
        votesCount: votes.length,
        votes: votesWithDesigns.filter((vote) => vote !== null),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[profile-votes][GET] Failed to load voted designs:', error);
    const message = error instanceof Error ? error.message : 'Failed to load voted designs';
    const status = message.includes('Valid email is required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}