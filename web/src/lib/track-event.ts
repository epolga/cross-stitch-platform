export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[GA4]', name, params);
  }
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.('event', name, params);
  }
}
