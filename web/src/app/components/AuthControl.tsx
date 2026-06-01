'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { RegisterForm } from './RegisterForm';
import { RegisterOnlyDialog } from './RegisterOnlyDialog';
import { useSearchParams, useRouter } from 'next/navigation';
import type { RegistrationSourceInfo } from '@/app/types/registration';

const USER_FIRST_NAME_STORAGE_KEY = 'userFirstName';
export const USER_VOTES_CHANGED_EVENT = 'userVotesChanged';

const normalizeStoredFirstName = (value: string | undefined): string => {
  const trimmed = (value || '').trim();
  return trimmed;
};

const persistStoredFirstName = (value: string | undefined): string => {
  const normalized = normalizeStoredFirstName(value);
  if (typeof window === 'undefined') {
    return normalized;
  }

  if (normalized) {
    localStorage.setItem(USER_FIRST_NAME_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(USER_FIRST_NAME_STORAGE_KEY);
  }

  return normalized;
};

const readStoredFirstName = (): string => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return '';
  }

  return normalizeStoredFirstName(localStorage.getItem(USER_FIRST_NAME_STORAGE_KEY) || '');
};

const normalizeInternalReturnPath = (value: string | undefined): string | null => {
  const trimmed = (value || '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }
  return trimmed;
};

// Utility function to check login status globally
export const isUserLoggedIn = (): boolean => {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return localStorage.getItem('isLoggedIn') === 'true';
  }
  return false;
};

// Dispatch custom event for auth state changes
const dispatchAuthStateChange = (): void => {
  if (typeof window !== 'undefined') {
    const event = new Event('authStateChange');
    window.dispatchEvent(event);
    console.log('Dispatched authStateChange event');
  }
};

function AutoLogin({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const eid = searchParams?.get('eid') || '';
    const cid = searchParams?.get('cid') || '';
    const loggedIn = isUserLoggedIn();

    if (eid && cid && !loggedIn) {
      console.log('Attempting email auto-login with cid');
      const autoLogin = async (): Promise<void> => {
        try {
          const response = await fetch('/api/auth/login-from-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eid, cid }),
          });

          const data: { success?: boolean; email?: string; firstName?: string } = await response.json();

          if (response.ok && data.success) {
            if (typeof window !== 'undefined') {
              localStorage.setItem('isLoggedIn', 'true');
              localStorage.setItem('userEmail', data.email ?? '');
              persistStoredFirstName(data.firstName);
            }
            onLoginSuccess();
            dispatchAuthStateChange();
            if (typeof window !== 'undefined') {
              router.replace(window.location.pathname);
            }
          } else {
            console.warn('Email auto-login blocked: user not verified or not found');
          }
        } catch (error) {
          console.error('Error during auto-login:', error);
        }
      };
      void autoLogin();
    }
  }, [searchParams, router, onLoginSuccess]);

  return null;
}

export type DownloadMode = 'free' | 'register' | 'paid';

const normalizeDownloadMode = (raw: string): DownloadMode => {
  if (raw === 'free' || raw === 'register' || raw === 'paid') return raw;
  return 'register';
};

export const resolveDownloadMode = (): DownloadMode => {
  const raw = (process.env.NEXT_PUBLIC_DOWNLOAD_MODE || '').toLowerCase().trim();
  console.log('resolveDownloadMode:', raw);
  return normalizeDownloadMode(raw);
};

export const fetchRuntimeDownloadMode = async (): Promise<DownloadMode> => {
  if (typeof window === 'undefined') {
    return resolveDownloadMode();
  }

  try {
    const response = await fetch('/api/config/download-mode', {
      method: 'GET',
      cache: 'no-store',
    });

    const data: { mode?: string } | null = await response
      .json()
      .catch(() => null);

    if (response.ok && typeof data?.mode === 'string') {
      return normalizeDownloadMode(data.mode.toLowerCase().trim());
    }
  } catch (error) {
    console.warn('Failed to fetch runtime download mode:', error);
  }

  return resolveDownloadMode();
};

export function AuthControl() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentFirstName, setCurrentFirstName] = useState('');
  const [currentUserVotesCount, setCurrentUserVotesCount] = useState(0);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false); // RegisterForm (PayPal)
  const [isRegisterOnlyOpen, setIsRegisterOnlyOpen] = useState(false); // RegisterOnlyDialog
  const [showVerifyNotice, setShowVerifyNotice] = useState(false);
  const [registrationSource, setRegistrationSource] = useState<RegistrationSourceInfo | null>(null);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  const closeRegisterOnly = (): void => {
    setIsRegisterOnlyOpen(false);
  };

  const [mode, setMode] = useState<DownloadMode>(() => resolveDownloadMode());

  useEffect(() => {
    let isMounted = true;

    const loadRuntimeMode = async (): Promise<void> => {
      const runtimeMode = await fetchRuntimeDownloadMode();
      if (isMounted) {
        setMode(runtimeMode);
      }
    };

    void loadRuntimeMode();

    return () => {
      isMounted = false;
    };
  }, []);

  const isValidEmail = (email: string): boolean =>
    email.includes('@') && email.includes('.');

  // Initialize login state from localStorage (client-side only)
  useEffect(() => {
    const loggedIn = isUserLoggedIn();
    setIsLoggedIn(loggedIn);
    if (typeof window !== 'undefined') {
      setCurrentEmail((localStorage.getItem('userEmail') || '').trim().toLowerCase());
      setCurrentFirstName(readStoredFirstName());
    }
    console.log('AuthControl component mounted, isLoggedIn from storage:', loggedIn);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isLoggedIn || !currentEmail) {
      setCurrentUserVotesCount(0);
      return;
    }

    let isMounted = true;

    const loadCurrentUserVotesCount = async (): Promise<void> => {
      try {
        const response = await fetch('/api/profile/votes?includeDesigns=false', {
          cache: 'no-store',
          headers: {
            'x-user-email': currentEmail,
          },
        });
        const data = (await response.json().catch(() => null)) as { votesCount?: number; error?: string } | null;

        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load voted design count');
        }

        if (isMounted) {
          setCurrentUserVotesCount(Math.max(0, data?.votesCount ?? 0));
        }
      } catch (error) {
        console.error('Failed to load voted design count:', error);
        if (isMounted) {
          setCurrentUserVotesCount(0);
        }
      }
    };

    const handleVotesChanged = (): void => {
      void loadCurrentUserVotesCount();
    };

    void loadCurrentUserVotesCount();
    window.addEventListener(USER_VOTES_CHANGED_EVENT, handleVotesChanged);

    return () => {
      isMounted = false;
      window.removeEventListener(USER_VOTES_CHANGED_EVENT, handleVotesChanged);
    };
  }, [currentEmail, isLoggedIn]);

  // Update LastSeenAt at most once per day while logged in
  useEffect(() => {
    if (!isLoggedIn || typeof window === 'undefined') return;

    const email = localStorage.getItem('userEmail') || '';
    if (!email) return;

    const now = Date.now();
    const storageKey = `lastSeenAtPing:${email}`;
    const lastSeenRaw = localStorage.getItem(storageKey);
    const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0;
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (lastSeen && now - lastSeen < oneDayMs) return;

    const updateLastSeen = async (): Promise<void> => {
      try {
        const response = await fetch('/api/auth/last-seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (response.ok) {
          localStorage.setItem(storageKey, String(now));
        } else {
          console.warn('LastSeenAt update failed with status', response.status);
        }
      } catch (error) {
        console.error('Failed to update LastSeenAt:', error);
      }
    };

    void updateLastSeen();
  }, [isLoggedIn]);

  // Global error logger
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handler = (e: ErrorEvent) => console.error('Global error:', e);
      window.addEventListener('error', handler);
      return () => window.removeEventListener('error', handler);
    }
  }, []);

  // Listen for openPayPalModal → open PayPal dialog (RegisterForm) in paid mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOpenPayPal = (event: Event) => {
        console.log('Received openPayPalModal event');
        if (mode === 'paid') {
          const detail = (
            event as CustomEvent<{
              sourceInfo?: RegistrationSourceInfo | null;
              design?: { DesignID?: number; Caption?: string; ImageUrl?: string | null };
            }>
          ).detail;

          let sourceInfo = detail?.sourceInfo ?? null;
          if (!sourceInfo && detail?.design?.DesignID) {
            sourceInfo = {
              source: 'design-download',
              label: `Download attempt for ${detail.design.Caption || `design ${detail.design.DesignID}`}`,
              designId: detail.design.DesignID,
              designCaption: detail.design.Caption,
              designUrl: `${window.location.origin}/designs/${detail.design.DesignID}`,
              designImageUrl: detail.design.ImageUrl || undefined,
            };
          }

          setRegistrationSource(sourceInfo);
          setIsRegisterModalOpen(true);
          closeRegisterOnly();
          setIsLoginModalOpen(false);
        }
      };
      window.addEventListener('openPayPalModal', handleOpenPayPal as EventListener);
      return () =>
        window.removeEventListener('openPayPalModal', handleOpenPayPal as EventListener);
    }
  }, [mode]);

  // Listen for openRegisterModal → open RegisterOnlyDialog (register mode)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOpenRegisterOnly = (event: Event) => {
        console.log('Received openRegister event');
        if (mode === 'register') {
          const detail =
            (event as CustomEvent<RegistrationSourceInfo | null>).detail ?? null;
          setRegistrationSource(detail);
          setIsRegisterOnlyOpen(true);
          setIsRegisterModalOpen(false);
          setIsLoginModalOpen(false);
        }
      };
      window.addEventListener('openRegisterModal', handleOpenRegisterOnly as EventListener);
      return () =>
        window.removeEventListener(
          'openRegisterModal',
          handleOpenRegisterOnly as EventListener,
        );
    }
  }, [mode]);

  const handleLoginClick = (): void => {
    console.log('Login button clicked, opening login modal...');
    setIsLoginModalOpen(true);
    setIsRegisterModalOpen(false);
    closeRegisterOnly();
    setRegistrationSource(null);
    setErrorMessage('');
    setForgotMessage('');
    setIsForgotMode(false);
    setForgotEmail('');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpenLoginModal = () => {
      setIsLoginModalOpen(true);
      setIsRegisterModalOpen(false);
      closeRegisterOnly();
      setRegistrationSource(null);
      setErrorMessage('');
      setForgotMessage('');
      setIsForgotMode(false);
      setForgotEmail('');
    };

    window.addEventListener('openLoginModal', handleOpenLoginModal);
    return () => window.removeEventListener('openLoginModal', handleOpenLoginModal);
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    console.log('Form submitted, starting login process');

    try {
      if (!isValidEmail(loginUsername)) {
        console.log('Invalid email format');
        setErrorMessage('Please enter a valid email address');
        setForgotMessage('');
        return;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginUsername, password: loginPassword }),
      });

      const data: { success?: boolean; error?: string; email?: string; firstName?: string } = await response.json();
      console.log('API response:', data);

      if (response.ok && data.success) {
        console.log('Login successful:', { username: loginUsername });
        const normalizedEmail = (data.email || loginUsername).trim().toLowerCase();
        const firstName = persistStoredFirstName(data.firstName);
        if (typeof window !== 'undefined') {
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('userEmail', normalizedEmail);
        }
        setCurrentEmail(normalizedEmail);
        setCurrentFirstName(firstName);
        setIsLoggedIn(true);
        setIsLoginModalOpen(false);
        setLoginUsername('');
        setLoginPassword('');
        setErrorMessage('');
        setForgotMessage('');
        setIsForgotMode(false);
        dispatchAuthStateChange();
      } else {
        console.log('Invalid credentials');
        setErrorMessage(data.error || 'Invalid email or password');
        setForgotMessage('');
      }
    } catch (error) {
      console.error('Error during login:', error);
      setErrorMessage('An error occurred during login. Please try again.');
      setForgotMessage('');
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    console.log('Submitting forgot password form');

    setErrorMessage('');
    setForgotMessage('');

    if (!isValidEmail(forgotEmail)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    try {
      // ✅ FIX: используем правильный API-роут для отправки письма
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });

      const data: { ok?: boolean; message?: string; error?: string } | null = await response
        .json()
        .catch(() => null);

      if (response.ok) {
        setForgotMessage(
          data?.message ||
            'If this email is registered, a reset link has been sent.',
        );
        setErrorMessage('');
      } else {
        setErrorMessage(data?.error || 'Failed to send reset link. Please try again.');
        setForgotMessage('');
      }
    } catch (error) {
      console.error('Error during password reset request:', error);
      setErrorMessage(
        'An error occurred while requesting a reset link. Please try again.',
      );
      setForgotMessage('');
    }
  };

  const handleLogout = (): void => {
    console.log('Logging out...');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem(USER_FIRST_NAME_STORAGE_KEY);
    }
    setCurrentEmail('');
    setCurrentFirstName('');
    setCurrentUserVotesCount(0);
    setIsLoggedIn(false);
    dispatchAuthStateChange();
  };

  const handleRegisterClick = (): void => {
    console.log('Register button clicked, opening register modal...');
    setErrorMessage('');
    setForgotMessage('');
    setIsLoginModalOpen(false);
    setRegistrationSource({
      source: 'auth-control',
      label: 'Register button in header',
    });

    if (mode === 'register') {
      setIsRegisterOnlyOpen(true);
      setIsRegisterModalOpen(false);
      return;
    }

    if (mode === 'paid') {
      setIsRegisterModalOpen(true);
      closeRegisterOnly();
      return;
    }
  };

  const closeLoginModal = (): void => {
    console.log('Closing login modal');
    setIsLoginModalOpen(false);
    setLoginUsername('');
    setLoginPassword('');
    setErrorMessage('');
    setForgotMessage('');
    setIsForgotMode(false);
    setForgotEmail('');
  };

  const handleRegisterOnlySuccess = (): void => {
    setIsRegisterModalOpen(false);
    closeRegisterOnly();
    setRegistrationSource(null);
    setShowVerifyNotice(true);
  };

  const handlePaidModalSuccess = (): void => {
    const returnPath = normalizeInternalReturnPath(registrationSource?.returnPath);

    setIsRegisterModalOpen(false);
    setRegistrationSource(null);
    if (typeof window !== 'undefined') {
      const loggedIn = isUserLoggedIn();
      setIsLoggedIn(loggedIn);
      setCurrentEmail((localStorage.getItem('userEmail') || '').trim().toLowerCase());
      setCurrentFirstName(readStoredFirstName());
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (returnPath && currentPath !== returnPath) {
        window.location.assign(returnPath);
      }
    }
  };

  const handleAutoLoginSuccess = (): void => {
    setIsLoggedIn(true);
    if (typeof window !== 'undefined') {
      setCurrentEmail((localStorage.getItem('userEmail') || '').trim().toLowerCase());
      setCurrentFirstName(readStoredFirstName());
    }
  };

  console.log(
    'Rendering AuthControl, isLoggedIn:',
    isLoggedIn,
    'isLoginModalOpen:',
    isLoginModalOpen,
    'mode:',
    mode,
  );

  // free-режим: вообще не показываем AuthControl
  if (mode === 'free') {
    return null;
  }

  const firstNameBadgeClass =
    '-ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-base font-semibold italic text-amber-900 underline decoration-amber-500 underline-offset-4 shadow-sm md:-ml-3 md:text-lg';
  const firstNameBadgeLinkClass =
    `${firstNameBadgeClass} cursor-pointer transition-all duration-150 ease-out hover:scale-110 hover:border-amber-400 hover:bg-amber-100 hover:text-amber-950 hover:shadow-md focus-visible:scale-110 focus-visible:border-amber-400 focus-visible:bg-amber-100 focus-visible:text-amber-950 focus-visible:shadow-md focus-visible:outline-none`;

  return (
    <div className="flex items-center space-x-2">
      <Suspense fallback={null}>
        <AutoLogin onLoginSuccess={handleAutoLoginSuccess} />
      </Suspense>

      {showVerifyNotice && (
        <div
          role="alert"
          className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)' }}
          onClick={() => setShowVerifyNotice(false)}
        >
          <div
            className="bg-white p-4 rounded-lg shadow-md w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-700 mb-3">
              We&apos;ve sent a verification link. Please check your inbox (and spam) to complete
              registration. You&apos;ll be logged in automatically after verification.
            </p>
            <button
              type="button"
              onClick={() => setShowVerifyNotice(false)}
              className="rounded-md bg-gray-500 px-3 py-1.5 text-white hover:bg-gray-600 text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {isLoggedIn ? (
        <>
          {currentFirstName && (
            currentUserVotesCount > 0 ? (
              <Link
                href="/profile/votes"
                className={firstNameBadgeLinkClass}
                aria-label={`Open profile for ${currentFirstName}`}
                title={`Open your private profile with ${currentUserVotesCount} voted design${currentUserVotesCount === 1 ? '' : 's'}`}
              >
                {`Hi ${currentFirstName}!`}
              </Link>
            ) : (
              <span
                className={firstNameBadgeClass}
                aria-label={`Logged in as ${currentFirstName}`}
              >
                {`Hi ${currentFirstName}!`}
              </span>
            )
          )}
          {currentFirstName && <span className="text-gray-400 text-lg">|</span>}
          <button
            onClick={handleLogout}
            className="text-gray-700 hover:text-gray-900 text-xl cursor-pointer pointer-events-auto"
            aria-label="Logout"
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleLoginClick}
            className="text-gray-500 hover:text-gray-900 text-xl cursor-pointer pointer-events-auto"
            aria-label="Login"
          >
            Login
          </button>
          <span className="text-gray-500 text-xl">|</span>
          <button
            onClick={handleRegisterClick}
            className="text-gray-500 hover:text-gray-900 text-xl cursor-pointer pointer-events-auto"
            aria-label="Register"
          >
            Register
          </button>
        </>
      )}

      {/* Login / Forgot Password Modal */}
      {isLoginModalOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)' }}
        >
          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {isForgotMode ? 'Reset password' : 'Login'}
              </h2>
              <button
                onClick={closeLoginModal}
                className="text-gray-500 hover:text-gray-700 text-xl"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {!isForgotMode ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-username"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <input
                    id="login-username"
                    type="email"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your email"
                    aria-label="Email"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your password"
                    aria-label="Password"
                    required
                  />
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center" role="alert">
                    {errorMessage}
                  </p>
                )}
                {forgotMessage && (
                  <p className="text-green-600 text-sm text-center" role="status">
                    {forgotMessage}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                  aria-label="Login"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(true);
                    setForgotEmail(loginUsername || '');
                    setErrorMessage('');
                    setForgotMessage('');
                  }}
                  className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Forgot password?
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <p className="text-sm text-gray-600">
                  Enter your email and we will send you a password reset link.
                </p>
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your email"
                    aria-label="Email"
                    required
                  />
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center" role="alert">
                    {errorMessage}
                  </p>
                )}
                {forgotMessage && (
                  <p className="text-green-600 text-sm text-center" role="status">
                    {forgotMessage}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                >
                  Send reset link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(false);
                    setErrorMessage('');
                    setForgotMessage('');
                  }}
                  className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Back to login
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* PayPal / full registration modal */}
      <RegisterForm
        isOpen={isRegisterModalOpen}
        onClose={() => {
          setIsRegisterModalOpen(false);
          setRegistrationSource(null);
        }}
        onLoginClick={handleLoginClick}
        onRegisterSuccess={handlePaidModalSuccess}
        isLoggedIn={isLoggedIn}
        currentEmail={currentEmail}
        sourceInfo={registrationSource}
      />

      {/* Register-only dialog */}
      <RegisterOnlyDialog
        isOpen={isRegisterOnlyOpen}
        onClose={() => {
          closeRegisterOnly();
          setRegistrationSource(null);
        }}
        onSuccess={handleRegisterOnlySuccess}
        sourceInfo={registrationSource}
      />
    </div>
  );
}
