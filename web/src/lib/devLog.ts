// Debug-trace logging for local development only. Production builds set
// NODE_ENV=production, so these calls become no-ops and stop flooding the
// EB instance's syslog (rsyslog captures the app's stdout there).
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
}
