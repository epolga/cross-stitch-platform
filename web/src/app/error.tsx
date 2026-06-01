'use client';

import { useEffect } from 'react';
import Link from 'next/link';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    const payload = {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      digest: error?.digest,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
    };

    console.error('Unhandled UI error:', payload);

    void fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error('Failed to report client error:', err);
    });
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="max-w-lg w-full p-4 border border-gray-200 rounded shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-700 mb-4">
            We hit an unexpected error. Please try again. The team has been notified.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 bg-gray-800 text-white rounded hover:bg-gray-900 text-sm"
            >
              Try again
            </button>
            <Link
              href="/"
              className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-800 hover:bg-gray-100"
            >
              Go home
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Error ID: {error?.digest || 'n/a'}
          </p>
        </div>
      </body>
    </html>
  );
}
