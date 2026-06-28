import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function requireAdmin(request: NextRequest): Promise<{ email: string } | NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(session.email.toLowerCase())) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  return { email: session.email };
}
