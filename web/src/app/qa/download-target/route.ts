import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse('QA download target reached.', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
