'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RegisterForm } from '@/app/components/RegisterForm';
import type { RegistrationSourceInfo } from '@/app/types/registration';

type DownloadAccessPageClientProps = {
  returnPath: string;
  designId?: number;
  designCaption?: string;
  designImageUrl?: string;
};

function normalizeInternalPath(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }
  return trimmed;
}

export default function DownloadAccessPageClient({
  returnPath,
  designId,
  designCaption,
  designImageUrl,
}: DownloadAccessPageClientProps) {
  const safeReturnPath = normalizeInternalPath(returnPath);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncAuthState = (): void => {
      const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
      setIsLoggedIn(loggedIn);
      setCurrentEmail((localStorage.getItem('userEmail') || '').trim().toLowerCase());
    };

    const handleStorage = (event: StorageEvent): void => {
      if (event.key === 'isLoggedIn' || event.key === 'userEmail') {
        syncAuthState();
      }
    };

    syncAuthState();
    window.addEventListener('authStateChange', syncAuthState as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('authStateChange', syncAuthState as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleRegisterSuccess = useCallback((): void => {
    if (typeof window === 'undefined') return;
    window.location.assign(safeReturnPath);
  }, [safeReturnPath]);

  const handleOpenLogin = useCallback((): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('openLoginModal'));
  }, []);

  const sourceInfo = useMemo<RegistrationSourceInfo>(
    () => ({
      source: 'download-access-page',
      label: designCaption
        ? `Download access page for ${designCaption}`
        : 'Dedicated download access page',
      note: 'Redirected from a paid download click.',
      designId,
      designCaption,
      designUrl:
        typeof window !== 'undefined'
          ? `${window.location.origin}${safeReturnPath}`
          : safeReturnPath,
      designImageUrl,
      returnPath: safeReturnPath,
    }),
    [designCaption, designId, designImageUrl, safeReturnPath],
  );

  const headline = designCaption
    ? `Finish setup to download "${designCaption}"`
    : 'Finish setup to continue your download';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm leading-6 text-gray-700">
          {headline}. Complete the same registration flow that used to appear in the popup.
          When access is granted, you will return to the design page and the pending download
          will continue automatically.
        </p>
        <Link
          href={safeReturnPath}
          className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Back to previous page
        </Link>
      </div>

      <RegisterForm
        isOpen
        onClose={handleRegisterSuccess}
        onLoginClick={handleOpenLogin}
        onRegisterSuccess={handleRegisterSuccess}
        isLoggedIn={isLoggedIn}
        currentEmail={currentEmail}
        sourceInfo={sourceInfo}
        displayMode="inline"
      />
    </div>
  );
}
