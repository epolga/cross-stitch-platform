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

// Some in-app browsers (e.g. Facebook/Instagram's iOS WebView) omit
// crypto.randomUUID even on otherwise-current iOS versions — this only
// needs to be a unique-enough session grouping key, not cryptographically
// secure, so a Math.random fallback is fine when the real API is missing.
function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('editor_session_id');
  if (!sid) {
    sid = makeSessionId();
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

// A same-sitting reopen (new tab -> new sessionId) shouldn't count as a
// "came back" signal, so a return generation additionally requires this
// much real time to have passed since the last one.
const RETURN_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

interface PatternGenState {
  count: number;
  lastSessionId: string;
  lastGenerationTime?: string;
}

export interface ReturnGenerationCheck {
  isReturn: boolean;
  gapHours?: number;
}

// Tracks pattern-generation count + which session/time last generated one,
// in localStorage (persists across sessions, unlike the per-tab sessionId
// above). Call once per generation. isReturn is true only when this
// generation happens in a *different* session than the previous one, after
// at least one prior generation, AND at least RETURN_GAP_MS has passed —
// i.e. "came back later and generated again", not just reopening a tab or
// generating twice in the same sitting.
export function checkReturnPatternGeneration(): ReturnGenerationCheck {
  if (typeof window === 'undefined') return { isReturn: false };
  const sessionId = getSessionId();
  let state: PatternGenState = { count: 0, lastSessionId: '' };
  try {
    const raw = localStorage.getItem(PATTERN_GEN_KEY);
    if (raw) state = JSON.parse(raw);
  } catch { /* ignore */ }

  const now = Date.now();
  const lastTime = state.lastGenerationTime ? new Date(state.lastGenerationTime).getTime() : 0;
  const gapMs = state.lastGenerationTime ? now - lastTime : 0;

  const isDifferentSession = state.lastSessionId !== '' && state.lastSessionId !== sessionId;
  const hasGeneratedBefore = state.count >= 1;
  const hasRealGap = gapMs >= RETURN_GAP_MS;
  const isReturnGeneration = isDifferentSession && hasGeneratedBefore && hasRealGap;

  state = { count: state.count + 1, lastSessionId: sessionId, lastGenerationTime: new Date(now).toISOString() };
  try { localStorage.setItem(PATTERN_GEN_KEY, JSON.stringify(state)); } catch { /* ignore */ }

  return isReturnGeneration
    ? { isReturn: true, gapHours: Math.round((gapMs / 3_600_000) * 10) / 10 }
    : { isReturn: false };
}
