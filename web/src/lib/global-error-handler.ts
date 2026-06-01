// Global error handler to log uncaught exceptions and unhandled rejections in one place.
import { sendEmailToAdmin } from './email-service';

const flag = Symbol.for('cross-stitch.globalErrorHandlerInitialized');
const globalSymbols = globalThis as Record<string | symbol, unknown>;

if (typeof window === 'undefined' && typeof process !== 'undefined' && !globalSymbols[flag]) {
  // Optionally enable source map support when dependency is present (avoids build-time resolution errors).
  let sourceMapsEnabled = false;
  try {
    const req = eval('require') as NodeRequire;
    req('source-map-support/register');
    sourceMapsEnabled = true;
  } catch {
    // Optional dependency not installed; continue without source maps.
  }

  const logError = (label: string, payload: Record<string, unknown>) => {
    const entry = {
      label,
      timestamp: new Date().toISOString(),
      sourceMapsEnabled,
      runtime: process.release?.name,
      nodeVersion: process.version,
      ...payload,
    };
    console.error(JSON.stringify(entry, null, 2));
  };

  // Simple throttle to avoid email storms (1 minute minimum between notifications)
  let lastEmailSentAt = 0;
  const MIN_EMAIL_INTERVAL_MS = 60_000;

  const notifyAdmin = async (label: string, payload: Record<string, unknown>) => {
    const now = Date.now();
    if (now - lastEmailSentAt < MIN_EMAIL_INTERVAL_MS) return;
    lastEmailSentAt = now;

    try {
      const pretty = JSON.stringify(payload, null, 2);
      await sendEmailToAdmin(
        `[Error] ${label}`,
        `<pre>${pretty}</pre>`,
        true,
      );
    } catch (err) {
      // If email fails, just log it; avoid throwing from handler
      console.error('Failed to notify admin about error:', err);
    }
  };

  process.on('uncaughtException', (err: Error) => {
    const payload = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    logError('uncaughtException', payload);
    void notifyAdmin('uncaughtException', payload);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : null;
    const payload = {
      message: error ? error.message : String(reason),
      name: error ? error.name : undefined,
      stack: error ? error.stack : undefined,
      type: error ? 'Error' : typeof reason,
    };
    logError('unhandledRejection', payload);
    void notifyAdmin('unhandledRejection', payload);
  });

  globalSymbols[flag] = true;
}
