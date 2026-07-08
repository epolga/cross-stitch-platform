import { NextResponse } from 'next/server';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

// Lets the drag-and-drop importer fetch an image from a URL (e.g. an <img>
// dragged out of Google Photos, which hands over a URL, not a File — the
// browser never downloads bytes for a cross-origin drag). Server-side fetch
// sidesteps that CORS gap. Rate limited and SSRF-guarded since it accepts an
// arbitrary user-supplied URL.
const isRateLimited = createRateLimiter(60_000, 10);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const FETCH_TIMEOUT_MS = 10_000;

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
    return false;
  }
  return true; // unparseable — treat as unsafe
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
  }

  try {
    const addresses = await lookup(parsed.hostname, { all: true });
    if (addresses.length === 0 || addresses.some(a => isPrivateIp(a.address))) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Could not resolve host' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'URL is not an image' }, { status: 415 });
    }

    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        return NextResponse.json({ error: 'Image too large' }, { status: 413 });
      }
      chunks.push(value);
    }

    return new NextResponse(Buffer.concat(chunks), {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
  }
}
