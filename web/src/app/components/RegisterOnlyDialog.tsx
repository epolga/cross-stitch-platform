'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { RegistrationSourceInfo } from '@/app/types/registration';

type RegisterOnlyDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (payload: { email: string; firstName: string }) => void;
  sourceInfo?: RegistrationSourceInfo | null;
};

export function RegisterOnlyDialog({
  isOpen,
  onClose,
  onSuccess,
  sourceInfo,
}: RegisterOnlyDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isValidEmail = useCallback((value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }, []);

  const PASSWORD_MIN_LENGTH = 6;

  const firstNameOk = firstName.trim().length > 0;
  const emailOk = isValidEmail(email);
  const confirmEmailOk = isValidEmail(confirmEmail);
  const emailsMatch = email.length > 0 && confirmEmail.length > 0 && email === confirmEmail;
  const passwordOk = password.length >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = password.length > 0 && password === password2;

  const formValid = useMemo(
    () =>
      firstNameOk &&
      emailOk &&
      confirmEmailOk &&
      emailsMatch &&
      passwordOk &&
      passwordsMatch,
    [firstNameOk, emailOk, confirmEmailOk, emailsMatch, passwordOk, passwordsMatch]
  );

  useEffect(() => {
    if (isOpen) {
      setFirstName('');
      setEmail('');
      setConfirmEmail('');
      setPassword('');
      setPassword2('');
      setSubmitting(false);
      setError(null);
      setDone(false);
      setSuccessMessage(null);
      // Don't auto-login; verification is required
      if (typeof window !== 'undefined') {
        localStorage.removeItem('isLoggedIn');
      }
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!formValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/register-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          firstName,
          password,
          sourceInfo: sourceInfo ?? undefined,
        }),
      });

      if (response.status === 409) {
        setError('This email is already registered.');
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Server error');
      }

      const data: { message?: string } = await response.json().catch(() => ({}));
      setDone(true);
      setSuccessMessage(
        data.message || 'Thanks for registering. Please check your email to verify your address.',
      );
      onSuccess?.({ email, firstName });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [email, firstName, password, formValid, submitting, onSuccess, sourceInfo]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)' }}
    >
      <div className="bg-white p-4 rounded-lg shadow-md w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Register</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-lg"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {!done ? (
          <>
            <p className="mb-3 text-xs text-gray-600">
              Hello there! I&apos;m Ann, and I&apos;m truly thrilled that you&apos;ve decided to join me today. It means so much to me personally.<br />
              To download the pattern, <b>just register</b>.<br />
              I&apos;ll also be able to inform you when a new pattern is added to the site. Just that—no spam, no promotions! I promise.<br />
              Could you please share your first name and email so we can create a special space just for you?
            </p>

            {error && (
              <p className="mb-2 text-sm text-red-500 text-center" role="alert">
                {error}
              </p>
            )}

            <div className="space-y-3">

              {/* First name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  First name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full p-1.5 border border-gray-300 rounded-md text-sm"
                  placeholder="Anna"
                  disabled={submitting}
                />
                {!firstNameOk && firstName.length > 0 && (
                  <p className="text-xs text-red-600 mt-1">First name is required.</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full p-1.5 border border-gray-300 rounded-md text-sm"
                  placeholder="you@example.com"
                  disabled={submitting}
                />
                {email.length > 0 && !emailOk && (
                  <p className="text-xs text-red-600 mt-1">Please enter a valid email.</p>
                )}
              </div>

              {/* Confirm email */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Confirm email
                </label>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  className="mt-1 w-full p-1.5 border border-gray-300 rounded-md text-sm"
                  placeholder="Repeat your email"
                  disabled={submitting}
                />
                {confirmEmail.length > 0 && !emailsMatch && (
                  <p className="text-xs text-red-600 mt-1">Emails do not match.</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full p-1.5 border border-gray-300 rounded-md text-sm"
                  placeholder="At least 6 characters"
                  disabled={submitting}
                />
                {password.length > 0 && !passwordOk && (
                  <p className="text-xs text-red-600 mt-1">
                    Password must be at least {PASSWORD_MIN_LENGTH} characters long.
                  </p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="mt-1 w-full p-1.5 border border-gray-300 rounded-md text-sm"
                  placeholder="Repeat your password"
                  disabled={submitting}
                />
                {password2.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
                )}
              </div>

            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!formValid || submitting}
                className="rounded-md bg-gray-500 px-3 py-1.5 text-white hover:bg-gray-600 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Register'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-gray-700 hover:text-gray-900"
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 rounded-md bg-green-50 p-2 text-green-700">
              {successMessage ||
                'Thanks for registering. Check your email for the verification link (it may be in spam). You will be able to download after you verify.'}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-gray-500 px-3 py-1.5 text-white hover:bg-gray-600"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
