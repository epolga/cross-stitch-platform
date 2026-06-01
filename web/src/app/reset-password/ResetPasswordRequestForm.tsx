'use client';

import { FormEvent, useState } from 'react';
import { getSiteHostname } from '@/lib/url-helper';

const siteHostname = getSiteHostname().replace(/^www\./i, '');

export default function ResetPasswordRequestForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage(null);

    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      setStatus('success');
      setMessage(
        data.message ??
          'If this email is registered, you will receive a link to reset your password.',
      );
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Something went wrong. Please try again later.');
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Reset your password</h1>
      <p className="mb-4 text-sm text-gray-700">
        Enter the email you used when registering on {siteHostname}. We will send you a
        link to choose a new password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="w-full border rounded px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
        >
          {status === 'loading' ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      {message && (
        <p className="mt-4 text-sm text-gray-800">
          {message}
        </p>
      )}
    </div>
  );
}
