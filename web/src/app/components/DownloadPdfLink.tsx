'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  isUserLoggedIn,
  resolveDownloadMode,
  fetchRuntimeDownloadMode,
  DownloadMode,
} from './AuthControl';
import { Design } from '../types/design';
//import { CreateDesignUrl } from '@/lib/url-helper';

type Props = {
  design: Design;
  className?: string;
  formatLabel?: string;
  formatNumber?: string;
  isMissing?: boolean;
};

type PaidDownloadAccessResponse = {
  allowed: boolean;
  reason:
    | 'SUBSCRIPTION_ACTIVE'
    | 'SUBSCRIPTION_INACTIVE'
    | 'TRIAL_ACTIVE'
    | 'TRIAL_NOT_STARTED'
    | 'TRIAL_LIMIT_REACHED'
    | 'TRIAL_EXPIRED'
    | 'USER_NOT_FOUND';
  counted: boolean;
  trial: {
    downloadsRemaining: number;
    downloadLimit: number;
  };
};

const PDF_BASE = 'https://d2o1uvvg91z7o4.cloudfront.net/pdfs';

export default function DownloadPdfLink({ design, className, formatLabel, formatNumber, isMissing }: Props) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [referrerBypass, setReferrerBypass] = useState(false);
  const [isCheckingPaidAccess, setIsCheckingPaidAccess] = useState(false);
  const [accessFeedback, setAccessFeedback] = useState('');

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

  const recordDownload = useCallback(() => {
    void fetch(`/api/designs/${design.DesignID}`, { method: 'POST' }).catch((error) =>
      console.error('Failed to increment download count', error),
    );
  }, [design.DesignID]);

  const fallbackPdfUrl = useMemo(() => {
    if (!design?.AlbumID || !design?.DesignID) return null;
    const chosenNumber = formatNumber || '1';
    return `${PDF_BASE}/${design.AlbumID}/${design.DesignID}/Stitch${design.DesignID}_${chosenNumber}_Kit.pdf`;
  }, [design.AlbumID, design.DesignID, formatNumber]);

  const resolvedPdfUrl = useMemo(() => {
    if (isMissing === true) {
      // Listed in MissingDesignPdfs.txt -> keep legacy link if present
      return design.PdfUrl ?? fallbackPdfUrl ?? null;
    }
    if (isMissing === false) {
      // Not listed -> use new per-format path
      return fallbackPdfUrl ?? design.PdfUrl ?? null;
    }
    // Unknown yet: default to existing link to avoid surprises
    return design.PdfUrl ?? fallbackPdfUrl ?? null;
  }, [design.PdfUrl, fallbackPdfUrl, isMissing]);

  useEffect(() => {
    console.log('[DownloadPdfLink] init', {
      designId: design.DesignID,
      albumId: design.AlbumID,
      pdfUrl: design.PdfUrl,
      fallbackPdfUrl,
      resolvedPdfUrl,
      formatLabel,
      formatNumber,
      isMissing,
    });
  }, [design.DesignID, design.AlbumID, design.PdfUrl, fallbackPdfUrl, resolvedPdfUrl, formatLabel, formatNumber, isMissing]);

  const handleDownload = useCallback(() => {
    if (!resolvedPdfUrl) {
      console.warn('[DownloadPdfLink] no resolvedPdfUrl', {
        designId: design.DesignID,
        albumId: design.AlbumID,
        formatNumber,
      });
      return;
    }

    console.log('[DownloadPdfLink] handleDownload', {
      designId: design.DesignID,
      albumId: design.AlbumID,
      resolvedPdfUrl,
      formatLabel,
      formatNumber,
    });

    recordDownload();
    if (typeof window !== 'undefined') {
      const pendingDownload = localStorage.getItem('pendingDownload');
      if (pendingDownload && pendingDownload === resolvedPdfUrl) {
        localStorage.removeItem('pendingDownload');
      }
      window.open(resolvedPdfUrl, '_blank', 'noopener,noreferrer');
    }
  }, [
    design.AlbumID,
    design.DesignID,
    formatLabel,
    formatNumber,
    recordDownload,
    resolvedPdfUrl,
  ]);

  // Keep auth state updated across same-tab and cross-tab
  useEffect(() => {
    const onAuthChange = () => {
      const newLoggedIn = isUserLoggedIn();
      setLoggedIn(newLoggedIn);

      // If newly logged in and there's a pending download matching this design's URL, trigger it
      if (newLoggedIn && !loggedIn) {
        const pendingDownload = localStorage.getItem('pendingDownload');
        if (pendingDownload && pendingDownload === resolvedPdfUrl) {
          if (mode === 'paid') return;
          window.open(pendingDownload, '_blank', 'noopener,noreferrer');
          localStorage.removeItem('pendingDownload');
        }
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'isLoggedIn') onAuthChange();
    };

    setLoggedIn(isUserLoggedIn());
    window.addEventListener('authStateChange', onAuthChange as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('authStateChange', onAuthChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [loggedIn, mode, resolvedPdfUrl]);

  // Dispatch event to open registration modal, and store pending download URL
  const openRegister = useCallback(() => {
    if (resolvedPdfUrl) {
      localStorage.setItem('pendingDownload', resolvedPdfUrl);
    }
    const designPath = `/designs/${design.DesignID}`;
    const absoluteDesignUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${designPath}`
        : designPath;

    const evt = new CustomEvent('openRegisterModal', {
      detail: {
        source: 'design-download',
        label: `Download attempt for ${design.Caption}${formatLabel ? ` (${formatLabel})` : ''}`,
        designId: design.DesignID,
        designCaption: design.Caption,
        designUrl: absoluteDesignUrl,
        designImageUrl: design.ImageUrl || undefined,
      },
    });
    window.dispatchEvent(evt);
  }, [design.DesignID, design.Caption, design.ImageUrl, resolvedPdfUrl, formatLabel]);

  // Dispatch event to open PayPal modal (handled elsewhere)
  const openPayPal = useCallback(() => {
    if (resolvedPdfUrl) {
      localStorage.setItem('pendingDownload', resolvedPdfUrl);
    }
    const designPath = `/designs/${design.DesignID}`;
    const absoluteDesignUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${designPath}`
        : designPath;

    const evt = new CustomEvent('openPayPalModal', {
      detail: {
        sourceInfo: {
          source: 'design-download',
          label: `Download attempt for ${design.Caption}${formatLabel ? ` (${formatLabel})` : ''}`,
          designId: design.DesignID,
          designCaption: design.Caption,
          designUrl: absoluteDesignUrl,
          designImageUrl: design.ImageUrl || undefined,
        },
        design,
      },
    });
    window.dispatchEvent(evt);
  }, [design, formatLabel, resolvedPdfUrl]);

  const redirectToPaidAccessPage = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (resolvedPdfUrl) {
      localStorage.setItem('pendingDownload', resolvedPdfUrl);
    }

    const params = new URLSearchParams();
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    params.set('returnTo', returnPath);
    params.set('designId', String(design.DesignID));

    if (design.Caption) {
      params.set('caption', design.Caption);
    }

    if (design.ImageUrl) {
      params.set('image', design.ImageUrl);
    }

    window.location.assign(`/download-access?${params.toString()}`);
  }, [design.Caption, design.DesignID, design.ImageUrl, resolvedPdfUrl]);

  const describePaidAccessResult = useCallback(
    (result: PaidDownloadAccessResponse): string => {
      if (result.reason === 'TRIAL_ACTIVE') {
        return 'Trial active.';
      }
      if (result.reason === 'SUBSCRIPTION_INACTIVE') {
        return 'Subscription expired. Renew to continue.';
      }
      if (result.reason === 'TRIAL_LIMIT_REACHED') {
        return 'Trial ended. Subscribe for unlimited access.';
      }
      if (result.reason === 'TRIAL_EXPIRED') {
        return 'Trial expired. Subscribe for unlimited access.';
      }
      if (result.reason === 'TRIAL_NOT_STARTED') {
        return 'Start for free or subscribe for unlimited access.';
      }
      if (result.reason === 'USER_NOT_FOUND') {
        return 'Create account to download patterns. Start for free or subscribe.';
      }
      return '';
    },
    [],
  );

  const handlePaidClick = useCallback(async () => {
    if (!loggedIn) {
      redirectToPaidAccessPage();
      return;
    }

    if (typeof window === 'undefined') return;

    const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
    if (!email) {
      redirectToPaidAccessPage();
      return;
    }

    setIsCheckingPaidAccess(true);
    try {
      const response = await fetch('/api/subscription/download-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          designId: design.DesignID,
          consume: true,
        }),
      });

      const result = (await response
        .json()
        .catch(() => null)) as PaidDownloadAccessResponse | null;

      if (response.ok && result?.allowed) {
        const feedback = describePaidAccessResult(result);
        setAccessFeedback(feedback);
        handleDownload();
        return;
      }

      if (result) {
        setAccessFeedback(describePaidAccessResult(result));
      } else {
        setAccessFeedback('Unable to verify paid access. Please try again.');
      }

      openPayPal();
    } catch (error) {
      console.error('[DownloadPdfLink] failed to check paid access', error);
      setAccessFeedback('Unable to verify paid access. Please try again.');
      openPayPal();
    } finally {
      setIsCheckingPaidAccess(false);
    }
  }, [
    loggedIn,
    openPayPal,
    redirectToPaidAccessPage,
    design.DesignID,
    handleDownload,
    describePaidAccessResult,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mode !== 'paid' || !loggedIn) return;

    const pendingDownload = localStorage.getItem('pendingDownload');
    const pendingPaidAccessGranted =
      localStorage.getItem('pendingPaidAccessGranted') === 'true';

    if (!pendingPaidAccessGranted || pendingDownload !== resolvedPdfUrl) {
      return;
    }

    localStorage.removeItem('pendingPaidAccessGranted');
    void handlePaidClick();
  }, [loggedIn, mode, resolvedPdfUrl, handlePaidClick]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const ref = document.referrer.toLowerCase();
    const allow =
      ref.includes('allcraftsblogs.com') || ref.includes('allcrafts.allcraftsblogs.com');
    setReferrerBypass(allow);
  }, []);

  if (!design || !resolvedPdfUrl) {
    return <p className="text-gray-500">PDF is not available for this design.</p>;
  }

  const downloadLabel = 'Download PDF';
  const labelContent = <span>Download PDF</span>;

  console.log(
    `DownloadPdfLink: mode = ${mode}, loggedIn = ${loggedIn}, format = ${formatLabel ?? 'default'}, formatNumber = ${formatNumber ?? 'default'}, url = ${resolvedPdfUrl}`,
  );

  // ===== MODES =====

  // 1) Free download for everyone
  if (mode === 'free') {
    return (
      <button
        type="button"
        onClick={handleDownload}
        className={className ?? 'inline-block text-gray-600 text-sm leading-tight underline cursor-pointer'}
        aria-label={downloadLabel}
      >
        {labelContent}
      </button>
    );
  }

  // 2) Registration required: show register modal if not logged in
  if (mode === 'register') {
    const allowDirectDownload = loggedIn || referrerBypass;

    return allowDirectDownload ? (
      <button
        type="button"
        onClick={handleDownload}
        className={className ?? 'inline-block text-gray-600 text-sm leading-tight underline cursor-pointer'}
        aria-label={downloadLabel}
      >
        {labelContent}
      </button>
    ) : (
      <button
        onClick={openRegister}
        className={className ?? 'inline-block text-gray-600 text-sm leading-tight underline cursor-pointer'}
        aria-label="Open register form"
        type="button"
      >
        {labelContent}
      </button>
    );
  }

  // 3) Paid mode: open PayPal modal
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() => {
          void handlePaidClick();
        }}
        className={className ?? 'inline-block text-gray-600 text-sm leading-tight underline cursor-pointer'}
        aria-label={loggedIn ? 'Open subscription checkout' : 'Review download plans'}
        type="button"
        disabled={isCheckingPaidAccess}
      >
        {labelContent}
      </button>
      {accessFeedback && (
        <p className="text-xs text-gray-600 leading-snug">{accessFeedback}</p>
      )}
    </div>
  );
}
