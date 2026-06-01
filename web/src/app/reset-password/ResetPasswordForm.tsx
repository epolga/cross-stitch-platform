'use client';

import { useState, FormEvent } from 'react';

type Props = {
  token: string;
};

export default function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Error updating password.');
        return;
      }

      setStatus('success');
      setMessage(data.message || 'Password has been updated.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Something went wrong. Please try again later.');
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Choose a new password</h1>
      <p className="mb-4 text-sm text-gray-700">
        Please enter your new password twice to confirm.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            className="w-full border rounded px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
            Repeat password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={6}
            className="w-full border rounded px-3 py-2 text-sm"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
        >
          {status === 'loading' ? 'Saving...' : 'Update password'}
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
