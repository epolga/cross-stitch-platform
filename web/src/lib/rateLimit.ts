// Simple in-memory sliding-window rate limiter, keyed by a caller-supplied
// string (typically client IP). One Map per createRateLimiter() call, scoped
// to the process lifetime — fine for a single EB instance; would need a
// shared store (e.g. Redis) if this app ever scales to multiple instances.

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'Unknown';
}

export function createRateLimiter(windowMs: number, max: number) {
  const hitsByKey = new Map<string, number[]>();

  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (hitsByKey.get(key) ?? []).filter((t) => t > cutoff);
    hits.push(now);
    hitsByKey.set(key, hits);

    if (hitsByKey.size > 10_000) {
      for (const [k, times] of hitsByKey) {
        if (times.every((t) => t <= cutoff)) hitsByKey.delete(k);
      }
    }

    return hits.length > max;
  };
}
