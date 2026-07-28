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

const PATTERN_GEN_KEY = 'patternGenState';

// Tracks pattern-generation count + which session last generated one, in
// localStorage (persists across sessions, unlike the per-tab sessionId
// above). Call once per generation. Returns true the first time a
// generation happens in a *different* session than the previous one, after
// at least one prior generation — i.e. "came back and generated again",
// not just generating twice in the same sitting.
export function checkReturnPatternGeneration(): boolean {
  if (typeof window === 'undefined') return false;
  const sessionId = getSessionId();
  let state = { count: 0, lastSessionId: '' };
  try {
    const raw = localStorage.getItem(PATTERN_GEN_KEY);
    if (raw) state = JSON.parse(raw);
  } catch { /* ignore */ }

  const isReturnVisit = state.lastSessionId !== '' && state.lastSessionId !== sessionId;
  const hasGeneratedBefore = state.count >= 1;
  const isReturnGeneration = isReturnVisit && hasGeneratedBefore;

  state = { count: state.count + 1, lastSessionId: sessionId };
  try { localStorage.setItem(PATTERN_GEN_KEY, JSON.stringify(state)); } catch { /* ignore */ }

  return isReturnGeneration;
}
