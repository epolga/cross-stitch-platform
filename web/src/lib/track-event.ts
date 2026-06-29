function isNoTrack(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some(c => c.trim().startsWith('no_track=1'));
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[GA4]', name, params);
  }
  if (typeof window !== 'undefined' && !isNoTrack()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.('event', name, params);
  }
}

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('editor_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('editor_session_id', sid);
  }
  return sid;
}

export function postEditorEvent(eventType: string, params?: Record<string, unknown>) {
  if (isNoTrack()) return;
  const sessionId = getSessionId();
  if (!sessionId) return;
  fetch('/api/analytics/editor-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType, sessionId, ...params }),
  }).catch(() => {});
}
