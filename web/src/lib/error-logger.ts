// src/lib/errorLogger.ts

function getLastUrl(): string {
  const g = globalThis as typeof globalThis & {
    __LAST_REQUEST_URL__?: string;
  };
  return g.__LAST_REQUEST_URL__ ?? 'Unknown URL';
}

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ [UNHANDLED_REJECTION]', reason);
  console.error('➡️  [REQUEST THAT FAILED]', getLastUrl());
});

process.on('uncaughtException', (err: unknown) => {
  console.error('❌ [UNCAUGHT_EXCEPTION]', err);
  console.error('➡️  [REQUEST THAT FAILED]', getLastUrl());
});
