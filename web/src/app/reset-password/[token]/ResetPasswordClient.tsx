"use client";

import { useState } from 'react';

type Props = {
  token: string;
};

export default function ResetPasswordClient({ token }: Props) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const PASSWORD_MIN_LENGTH = 6;
  const passwordOk = password.length >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = password.length > 0 && password === password2;
  const formValid = passwordOk && passwordsMatch && !submitting;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!passwordOk) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data: { success?: boolean; error?: string } = await response.json();

      if (response.ok && data.success) {
        setMessage('Your password has been changed successfully.');
      } else {
        setError(data.error || 'Failed to reset password. Please try again.');
      }
    } catch (err) {
      console.error('Reset password error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Reset password</h1>

        <p className="mb-4 text-sm text-gray-600">
          Please choose a new password for your account.
        </p>

        <p className="mb-4 text-xs text-gray-400 break-all">
          Token: <span className="font-mono">{token}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              disabled={submitting}
            />
            {password.length > 0 && !passwordOk && (
              <p className="text-xs text-red-600 mt-1">
                Password must be at least {PASSWORD_MIN_LENGTH} characters long.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Confirm new password
            </label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              placeholder="Repeat your password"
              disabled={submitting}
            />
            {password2.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-600 mt-1">
                Passwords do not match.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          {message && (
            <p className="text-sm text-green-600 text-center">{message}</p>
          )}

          <button
            type="submit"
            disabled={!formValid}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </main>
  );
}

