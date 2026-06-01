'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import type {
  PreferredSubscriptionPlan,
  RegistrationSourceInfo,
} from '@/app/types/registration';

interface PayPalData {
  subscriptionID?: string | null;
}

interface PayPalActions {
  subscription: {
    create: (options: { plan_id: string; custom_id?: string }) => Promise<string>;
  };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  interval: string;
  recommended?: boolean;
}

interface TrialStatusResponse {
  status: 'NOT_STARTED' | 'ACTIVE' | 'LIMIT_REACHED' | 'EXPIRED';
  available: boolean;
  startedAt?: string;
  endsAt?: string;
  downloadLimit: number;
  downloadsUsed: number;
  downloadsRemaining: number;
  durationDays?: number;
}

interface SubscriptionStatusResponse {
  active?: boolean;
  status?: string;
  error?: string;
  trial?: TrialStatusResponse;
}

interface StartTrialResponse {
  outcome?:
    | 'USER_CREATED_AND_STARTED'
    | 'STARTED'
    | 'ALREADY_STARTED'
    | 'SUBSCRIPTION_ACTIVE'
    | 'SUBSCRIPTION_INACTIVE'
    | 'MISSING_REGISTRATION_FIELDS';
  trial?: TrialStatusResponse;
  error?: string;
}

interface RegisterFormProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginClick: () => void;
  onRegisterSuccess: () => void;
  isLoggedIn?: boolean;
  currentEmail?: string;
  sourceInfo?: RegistrationSourceInfo | null;
  displayMode?: 'modal' | 'inline';
  hideLoginPrompt?: boolean;
}

interface EngagementSnapshot {
  timeOnPageMs: number;
  mouseMoves: number;
  pointerDowns: number;
  clicks: number;
  keyDowns: number;
  touchStarts: number;
  interactionEvents: number;
  maxScrollDepthPct: number;
  webdriver: boolean;
}

type HumanLikelihood = 'LIKELY_HUMAN' | 'LIKELY_BOT' | 'UNKNOWN';

const DEFAULT_TRIAL_DURATION_DAYS = 30;
const DEFAULT_MONTHLY_PLAN_ID = 'P-4JN53753JF067172ANGILEGY';
const DEFAULT_YEARLY_PLAN_ID = 'P-4R88162396385170BNGILF7Y';

function normalizePreferredPlan(
  value: PreferredSubscriptionPlan | undefined,
): PreferredSubscriptionPlan {
  return value === 'yearly' ? 'yearly' : 'monthly';
}

function buildDefaultPlans(): SubscriptionPlan[] {
  return [
    {
      id: DEFAULT_MONTHLY_PLAN_ID,
      name: 'Monthly Plan',
      price: '$4.50 / month',
      interval: 'Monthly',
      recommended: true,
    },
    {
      id: DEFAULT_YEARLY_PLAN_ID,
      name: 'Yearly Plan',
      price: '$27 / year',
      interval: 'Yearly',
      recommended: false,
    },
  ];
}

function escapeHtml(value: string | undefined): string {
  const raw = value || '';
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function inferSourceInfoFromClient(): RegistrationSourceInfo {
  if (typeof window === 'undefined') {
    return { source: 'unknown', label: 'unknown' };
  }

  const currentUrl = sanitizeHttpUrl(window.location.href);
  const pendingDownload = localStorage.getItem('pendingDownload') || '';
  const pendingMatch = pendingDownload.match(/\/pdfs\/(\d+)\/(\d+)\/Stitch(\d+)_/i);
  const albumId = pendingMatch?.[1];
  const designIdFromPath = pendingMatch?.[2];
  const designIdFromName = pendingMatch?.[3];
  const designId = designIdFromPath || designIdFromName;

  const origin =
    sanitizeHttpUrl(window.location.origin) || `${window.location.protocol}//${window.location.host}`;
  const designUrl = designId
    ? sanitizeHttpUrl(`${origin}/designs/${designId}`)
    : currentUrl;
  const designImageUrl =
    albumId && designId
      ? sanitizeHttpUrl(
          `https://d2o1uvvg91z7o4.cloudfront.net/photos/${albumId}/${designId}/4.jpg`,
        )
      : null;

  return {
    source: 'design-download-fallback',
    label: 'Download modal opened',
    designId: designId ? Number(designId) : undefined,
    designUrl: designUrl || undefined,
    designImageUrl: designImageUrl || undefined,
  };
}

function describeOpenTrigger(source: string | undefined): string {
  const normalized = (source || '').trim().toLowerCase();
  if (normalized === 'design-download' || normalized === 'design-download-fallback') {
    return 'Download link on design page';
  }
  if (normalized === 'auth-control') {
    return 'Register link in navbar';
  }
  if (normalized === 'newsletter-cta') {
    return 'Newsletter signup link';
  }
  if (!normalized) {
    return 'Unknown';
  }
  return normalized;
}

function describeArrivalSource(): { label: string; referrerUrl?: string } {
  if (typeof window === 'undefined') {
    return { label: 'Unknown' };
  }

  const pageUrl = new URL(window.location.href);
  const utmSource = (pageUrl.searchParams.get('utm_source') || '').trim();
  const utmMedium = (pageUrl.searchParams.get('utm_medium') || '').trim();
  if (utmSource) {
    const mediumPart = utmMedium ? ` (${utmMedium})` : '';
    return { label: `UTM: ${utmSource}${mediumPart}` };
  }

  const referrerUrl = sanitizeHttpUrl(document.referrer);
  if (!referrerUrl) {
    return { label: 'Direct or unknown' };
  }

  try {
    const referrerHost = new URL(referrerUrl).hostname.toLowerCase();
    if (referrerHost.includes('pinterest.')) return { label: 'Pinterest', referrerUrl };
    if (referrerHost.includes('facebook.') || referrerHost === 'fb.com') {
      return { label: 'Facebook', referrerUrl };
    }
    if (referrerHost.includes('instagram.')) return { label: 'Instagram', referrerUrl };
    if (referrerHost === 't.co' || referrerHost.includes('twitter.') || referrerHost.includes('x.com')) {
      return { label: 'X / Twitter', referrerUrl };
    }
    if (referrerHost.includes('reddit.')) return { label: 'Reddit', referrerUrl };
    if (referrerHost.includes('google.')) return { label: 'Google Search', referrerUrl };
    if (referrerHost.includes('bing.')) return { label: 'Bing Search', referrerUrl };
    if (referrerHost.includes('duckduckgo.')) return { label: 'DuckDuckGo', referrerUrl };
    if (
      referrerHost.includes('mail.') ||
      referrerHost.includes('outlook.') ||
      referrerHost.includes('gmail.') ||
      referrerHost.includes('yahoo.')
    ) {
      return { label: 'Email client/provider', referrerUrl };
    }

    if (referrerHost.includes('cross-stitch.com')) {
      return { label: 'Internal site navigation', referrerUrl };
    }

    return { label: referrerHost, referrerUrl };
  } catch {
    return { label: 'Unknown', referrerUrl };
  }
}

function classifyHumanLikelihood(snapshot: EngagementSnapshot): {
  likelihood: HumanLikelihood;
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (snapshot.webdriver) {
    score -= 4;
    reasons.push('navigator.webdriver=true');
  }

  if (snapshot.timeOnPageMs >= 15000) {
    score += 2;
    reasons.push('time_on_page>=15s');
  } else if (snapshot.timeOnPageMs < 2000) {
    score -= 1;
    reasons.push('time_on_page<2s');
  }

  if (snapshot.pointerDowns > 0) {
    score += 2;
    reasons.push('pointer_down');
  }
  if (snapshot.clicks > 0) {
    score += 2;
    reasons.push('click');
  }
  if (snapshot.mouseMoves >= 4) {
    score += 1;
    reasons.push('mouse_moves>=4');
  }
  if (snapshot.keyDowns > 0) {
    score += 1;
    reasons.push('key_down');
  }
  if (snapshot.touchStarts > 0) {
    score += 1;
    reasons.push('touch_start');
  }
  if (snapshot.maxScrollDepthPct >= 15) {
    score += 1;
    reasons.push('scroll>=15%');
  }

  if (snapshot.interactionEvents === 0) {
    score -= 2;
    reasons.push('no_interactions');
  }

  let likelihood: HumanLikelihood = 'UNKNOWN';
  if (score >= 3) {
    likelihood = 'LIKELY_HUMAN';
  } else if (score <= -2) {
    likelihood = 'LIKELY_BOT';
  }

  return { likelihood, score, reasons };
}

export function RegisterForm({
  isOpen,
  onClose,
  onLoginClick,
  onRegisterSuccess,
  isLoggedIn = false,
  currentEmail = '',
  sourceInfo = null,
  displayMode = 'modal',
  hideLoginPrompt = false,
}: RegisterFormProps) {
  const [registerEmail, setRegisterEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [receiveUpdates, setReceiveUpdates] = useState(true);

  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const initialPreferredPlan = normalizePreferredPlan(sourceInfo?.preferredPlan);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => buildDefaultPlans());
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() =>
    initialPreferredPlan === 'yearly' ? DEFAULT_YEARLY_PLAN_ID : DEFAULT_MONTHLY_PLAN_ID,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatusResponse | null>(null);
  const hasSentOpenNotificationRef = useRef(false);
  const engagementRef = useRef({
    mountedAtMs: 0,
    mouseMoves: 0,
    pointerDowns: 0,
    clicks: 0,
    keyDowns: 0,
    touchStarts: 0,
    maxScrollDepthPct: 0,
  });

  const getEngagementSnapshot = useCallback((): EngagementSnapshot => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return {
        timeOnPageMs: 0,
        mouseMoves: 0,
        pointerDowns: 0,
        clicks: 0,
        keyDowns: 0,
        touchStarts: 0,
        interactionEvents: 0,
        maxScrollDepthPct: 0,
        webdriver: false,
      };
    }

    const now = Date.now();
    const mountedAtMs = engagementRef.current.mountedAtMs || now;
    const timeOnPageMs = Math.max(0, now - mountedAtMs);
    const interactionEvents =
      engagementRef.current.mouseMoves +
      engagementRef.current.pointerDowns +
      engagementRef.current.clicks +
      engagementRef.current.keyDowns +
      engagementRef.current.touchStarts;

    return {
      timeOnPageMs,
      mouseMoves: engagementRef.current.mouseMoves,
      pointerDowns: engagementRef.current.pointerDowns,
      clicks: engagementRef.current.clicks,
      keyDowns: engagementRef.current.keyDowns,
      touchStarts: engagementRef.current.touchStarts,
      interactionEvents,
      maxScrollDepthPct: engagementRef.current.maxScrollDepthPct,
      webdriver: typeof navigator !== 'undefined' && navigator.webdriver === true,
    };
  }, []);

  const isValidEmail = (email: string): boolean =>
    email.includes('@') && email.includes('.');

  const normalizedCurrentEmail = currentEmail.trim().toLowerCase();

  const effectiveEmail = useMemo(() => {
    if (isLoggedIn && normalizedCurrentEmail) return normalizedCurrentEmail;
    return registerEmail.trim().toLowerCase();
  }, [isLoggedIn, normalizedCurrentEmail, registerEmail]);

  const isFormValid = useMemo(() => {
    if (isLoggedIn) {
      return isValidEmail(effectiveEmail);
    }

    return (
      registerEmail.trim() !== '' &&
      confirmEmail.trim() !== '' &&
      isValidEmail(registerEmail) &&
      isValidEmail(confirmEmail) &&
      registerEmail === confirmEmail &&
      registerPassword.trim() !== '' &&
      confirmPassword.trim() !== '' &&
      registerPassword === confirmPassword
    );
  }, [
    isLoggedIn,
    effectiveEmail,
    registerEmail,
    confirmEmail,
    registerPassword,
    confirmPassword,
  ]);

  const trialStatus = subscriptionStatus?.trial;
  const hasActiveSubscription = subscriptionStatus?.active === true;
  const isSubscriptionInactive = subscriptionStatus?.status === 'INACTIVE_RECORDED';
  const canStartTrial =
    !hasActiveSubscription &&
    !isSubscriptionInactive &&
    (!trialStatus || trialStatus.status === 'NOT_STARTED');

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
  const hasPayPalClientId = clientId.trim().length > 0;

  const dispatchAuthStateChange = useCallback((): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('authStateChange'));
  }, []);

  const markPendingAccessGranted = useCallback((): void => {
    if (typeof window === 'undefined') return;
    const pendingDownload = localStorage.getItem('pendingDownload');
    if (pendingDownload) {
      localStorage.setItem('pendingPaidAccessGranted', 'true');
    }
  }, []);

  const persistLogin = useCallback((email: string): void => {
    if (typeof window === 'undefined') return;
    const normalized = email.trim().toLowerCase();
    const normalizedFirstName = normalized.split('@')[0]?.trim() || '';
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', normalized);
    if (normalizedFirstName) {
      localStorage.setItem('userFirstName', normalizedFirstName);
    } else {
      localStorage.removeItem('userFirstName');
    }
    dispatchAuthStateChange();
  }, [dispatchAuthStateChange]);

  const resetFormState = (): void => {
    setErrorMessage('');
    setInfoMessage('');
    setRegisterPassword('');
    setConfirmPassword('');
    if (!isLoggedIn) {
      setRegisterEmail('');
      setConfirmEmail('');
      setReceiveUpdates(true);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSubscriptionStatus(null);
      setIsCheckingSubscription(false);
      return;
    }

    setErrorMessage('');
    setInfoMessage('');

    if (isLoggedIn && normalizedCurrentEmail) {
      setRegisterEmail(normalizedCurrentEmail);
      setConfirmEmail(normalizedCurrentEmail);
    }
  }, [isOpen, isLoggedIn, normalizedCurrentEmail]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!engagementRef.current.mountedAtMs) {
      engagementRef.current.mountedAtMs = Date.now();
    }

    const clampCounter = (current: number): number => Math.min(current + 1, 5000);

    const updateScrollDepth = (): void => {
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrolled = Math.max(0, window.scrollY || window.pageYOffset || 0);
      const pct = Math.max(
        0,
        Math.min(100, Math.round((scrolled / scrollable) * 100)),
      );
      engagementRef.current.maxScrollDepthPct = Math.max(
        engagementRef.current.maxScrollDepthPct,
        pct,
      );
    };

    const onMouseMove = (): void => {
      engagementRef.current.mouseMoves = clampCounter(engagementRef.current.mouseMoves);
    };
    const onPointerDown = (): void => {
      engagementRef.current.pointerDowns = clampCounter(
        engagementRef.current.pointerDowns,
      );
    };
    const onClick = (): void => {
      engagementRef.current.clicks = clampCounter(engagementRef.current.clicks);
    };
    const onKeyDown = (): void => {
      engagementRef.current.keyDowns = clampCounter(engagementRef.current.keyDowns);
    };
    const onTouchStart = (): void => {
      engagementRef.current.touchStarts = clampCounter(
        engagementRef.current.touchStarts,
      );
    };

    updateScrollDepth();

    window.addEventListener('scroll', updateScrollDepth, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('click', onClick, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateScrollDepth);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const fetchPlans = async (): Promise<void> => {
      const preferredPlan = normalizePreferredPlan(sourceInfo?.preferredPlan);

      try {
        const response = await fetch('/api/subscription/plan', { method: 'POST' });
        const data = (await response.json().catch(() => null)) as
          | { monthlyPlanId?: string; yearlyPlanId?: string; error?: string }
          | null;

        if (!response.ok) {
          setErrorMessage(data?.error || 'Failed to load payment plans.');
          return;
        }

        const fetchedPlans: SubscriptionPlan[] = [
          {
            id: data?.monthlyPlanId || DEFAULT_MONTHLY_PLAN_ID,
            name: 'Monthly Plan',
            price: '$4.50 / month',
            interval: 'Monthly',
            recommended: true,
          },
          {
            id: data?.yearlyPlanId || DEFAULT_YEARLY_PLAN_ID,
            name: 'Yearly Plan',
            price: '$27 / year',
            interval: 'Yearly',
            recommended: false,
          },
        ];

        setPlans(fetchedPlans);
        const preferredPlanId =
          preferredPlan === 'yearly' ? fetchedPlans[1]?.id : fetchedPlans[0]?.id;
        setSelectedPlanId(preferredPlanId || fetchedPlans[0]?.id || null);
      } catch (error) {
        console.error('Error fetching plans:', error);
        setErrorMessage('Error loading payment plans. Please try again.');
      }
    };

    void fetchPlans();
  }, [isOpen, sourceInfo?.preferredPlan]);

  useEffect(() => {
    if (!isOpen) {
      hasSentOpenNotificationRef.current = false;
      return;
    }

    const notifyAdmin = async (): Promise<void> => {
      if (hasSentOpenNotificationRef.current) {
        return;
      }

      try {
        const resolvedSource = sourceInfo ?? inferSourceInfoFromClient();
        const designUrl = sanitizeHttpUrl(resolvedSource?.designUrl);
        const designImageUrl = sanitizeHttpUrl(resolvedSource?.designImageUrl);
        const caption = escapeHtml(resolvedSource?.designCaption || 'Selected design');
        const openTrigger = escapeHtml(describeOpenTrigger(resolvedSource?.source));
        const arrival = describeArrivalSource();
        const arrivalLabel = escapeHtml(arrival.label);
        const engagement = getEngagementSnapshot();
        const classified = classifyHumanLikelihood(engagement);
        const nowDate = new Date();
        const dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        };
        const nowUtc = new Intl.DateTimeFormat('en-GB', {
          ...dateTimeFormatOptions,
          timeZone: 'UTC',
        }).format(nowDate);
        const nowIl = new Intl.DateTimeFormat('en-GB', {
          ...dateTimeFormatOptions,
          timeZone: 'Asia/Jerusalem',
        }).format(nowDate);
        const detailRows = [
          `<p><strong>Form opened from:</strong> ${openTrigger}</p>`,
          `<p><strong>Arrival source:</strong> ${arrivalLabel}</p>`,
          `<p><strong>Human likelihood:</strong> ${classified.likelihood} (score ${classified.score})</p>`,
          `<p><strong>Time (UTC):</strong> ${nowUtc}</p>`,
          `<p><strong>Time (IL):</strong> ${nowIl}</p>`,
        ];
        detailRows.push(
          `<p><strong>Engagement:</strong> time_on_page=${engagement.timeOnPageMs}ms; clicks=${engagement.clicks}; pointer_downs=${engagement.pointerDowns}; mouse_moves=${engagement.mouseMoves}; key_downs=${engagement.keyDowns}; touch_starts=${engagement.touchStarts}; max_scroll=${engagement.maxScrollDepthPct}%; webdriver=${engagement.webdriver}</p>`,
        );
        if (classified.reasons.length > 0) {
          detailRows.push(
            `<p><strong>Scoring signals:</strong> ${escapeHtml(classified.reasons.join(', '))}</p>`,
          );
        }
        if (arrival.referrerUrl) {
          detailRows.push(
            `<p><strong>Referrer:</strong> <a href="${arrival.referrerUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(arrival.referrerUrl)}</a></p>`,
          );
        }
        if (resolvedSource?.designId) {
          detailRows.push(`<p><strong>Design ID:</strong> ${resolvedSource.designId}</p>`);
        }
        if (designUrl) {
          detailRows.push(
            `<p><strong>Design:</strong> <a href="${designUrl}" target="_blank" rel="noopener noreferrer">${caption}</a></p>`,
          );
        }
        const hasSpecificDesignContext =
          Boolean(resolvedSource?.designId) || Boolean(designImageUrl);
        if (!hasSpecificDesignContext) {
          detailRows.push(
            '<p><strong>Design context:</strong> not detected automatically.</p>',
          );
        }

        const imageHtml = designUrl && designImageUrl
          ? `<p><a href="${designUrl}" target="_blank" rel="noopener noreferrer"><img src="${designImageUrl}" alt="${caption}" style="max-width:100px;max-height:100px;width:auto;height:auto;object-fit:contain;border:1px solid #ddd;border-radius:6px;" /></a></p>`
          : '';
        const message = `
          <p>A user has opened the registration form.</p>
          ${detailRows.join('\n')}
          ${imageHtml}
        `;

        await fetch('/api/notify-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: 'Registration Form Opened',
            message,
            html: true,
          }),
        });
        hasSentOpenNotificationRef.current = true;
      } catch (error) {
        console.error('Failed to send email notification to admin:', error);
      }
    };

    void notifyAdmin();
  }, [getEngagementSnapshot, isOpen, sourceInfo]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isValidEmail(effectiveEmail)) {
      setSubscriptionStatus(null);
      setIsCheckingSubscription(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const checkSubscriptionStatus = async (): Promise<void> => {
        setIsCheckingSubscription(true);

        try {
          const response = await fetch('/api/subscription/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: effectiveEmail }),
            signal: abortController.signal,
          });

          const data = (await response
            .json()
            .catch(() => null)) as SubscriptionStatusResponse | null;

          if (response.ok) {
            setSubscriptionStatus(data);
            return;
          }

          setSubscriptionStatus(null);
          setErrorMessage(data?.error || 'Unable to verify subscription status.');
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') return;
          console.error('Error checking subscription status:', error);
          setSubscriptionStatus(null);
          setErrorMessage('Unable to verify subscription status.');
        } finally {
          setIsCheckingSubscription(false);
        }
      };

      void checkSubscriptionStatus();
    }, 300);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, effectiveEmail]);

  const handlePayPalSubscription = (
    data: Record<string, unknown>,
    actions: PayPalActions,
  ) => {
    try {
      if (!selectedPlanId) {
        throw new Error('No payment plan selected');
      }

      return actions.subscription.create({
        plan_id: selectedPlanId,
        custom_id: effectiveEmail,
      });
    } catch (error) {
      console.error('Error initiating subscription:', error, data);
      setErrorMessage('Failed to initiate payment.');
      throw error;
    }
  };

  const handlePayPalApprove = async (data: PayPalData): Promise<void> => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      if (!data.subscriptionID) {
        throw new Error('No subscription ID provided');
      }

      const response = await fetch('/api/subscription/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: data.subscriptionID,
          email: effectiveEmail,
          password: isLoggedIn ? undefined : registerPassword,
          username: effectiveEmail.split('@')[0],
          receiveUpdates,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!response.ok) {
        setErrorMessage(result?.error || 'Failed to complete subscription.');
        return;
      }

      markPendingAccessGranted();
      persistLogin(effectiveEmail);
      resetFormState();
      onRegisterSuccess();
    } catch (error) {
      console.error('Error confirming subscription:', error);
      setErrorMessage('Error completing subscription. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartTrial = useCallback(async (): Promise<void> => {
    setErrorMessage('');
    setInfoMessage('');

    if (!isValidEmail(effectiveEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!isLoggedIn && !isFormValid) {
      setErrorMessage('Please complete registration fields to start your trial.');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: effectiveEmail,
          password: isLoggedIn ? undefined : registerPassword,
          firstName: effectiveEmail.split('@')[0] || 'User',
          username: effectiveEmail.split('@')[0] || 'user',
          receiveUpdates,
        }),
      });

      const result = (await response.json().catch(() => null)) as StartTrialResponse | null;

      if (!response.ok) {
        setErrorMessage(result?.error || 'Unable to start free trial.');
        return;
      }

      if (result?.trial) {
        setSubscriptionStatus((prev) => ({ ...(prev || {}), trial: result.trial }));
      }

      if (result?.outcome === 'SUBSCRIPTION_INACTIVE') {
        setErrorMessage('Subscription expired. Renew to continue.');
        return;
      }

      if (result?.outcome === 'SUBSCRIPTION_ACTIVE') {
        markPendingAccessGranted();
        persistLogin(effectiveEmail);
        setInfoMessage('Subscription active. You have unlimited downloads.');
        onRegisterSuccess();
        return;
      }

      markPendingAccessGranted();
      persistLogin(effectiveEmail);

      const days = result?.trial?.durationDays ?? DEFAULT_TRIAL_DURATION_DAYS;
      setInfoMessage(`Trial started for ${days} days.`);

      onRegisterSuccess();
    } catch (error) {
      console.error('Error starting trial:', error);
      setErrorMessage('Unable to start free trial. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [
    effectiveEmail,
    isLoggedIn,
    isFormValid,
    onRegisterSuccess,
    markPendingAccessGranted,
    persistLogin,
    receiveUpdates,
    registerPassword,
  ]);

  const handleEmailChange = (value: string): void => {
    setRegisterEmail(value);
    if (!isValidEmail(value)) {
      setErrorMessage('Please enter a valid email address');
    } else if (confirmEmail && value !== confirmEmail) {
      setErrorMessage('Emails do not match');
    } else if (
      errorMessage === 'Please enter a valid email address' ||
      errorMessage === 'Emails do not match'
    ) {
      setErrorMessage('');
    }
  };

  const handleConfirmEmailChange = (value: string): void => {
    setConfirmEmail(value);
    if (!isValidEmail(value)) {
      setErrorMessage('Please enter a valid email address');
    } else if (registerEmail && value !== registerEmail) {
      setErrorMessage('Emails do not match');
    } else if (
      errorMessage === 'Please enter a valid email address' ||
      errorMessage === 'Emails do not match'
    ) {
      setErrorMessage('');
    }
  };

  const handlePasswordChange = (value: string): void => {
    setRegisterPassword(value);
    if (confirmPassword && value !== confirmPassword) {
      setErrorMessage('Passwords do not match');
    } else if (errorMessage === 'Passwords do not match') {
      setErrorMessage('');
    }
  };

  const handleConfirmPasswordChange = (value: string): void => {
    setConfirmPassword(value);
    if (registerPassword && value !== registerPassword) {
      setErrorMessage('Passwords do not match');
    } else if (errorMessage === 'Passwords do not match') {
      setErrorMessage('');
    }
  };

  if (!isOpen) return null;
  const trialDays = trialStatus?.durationDays ?? DEFAULT_TRIAL_DURATION_DAYS;
  const TitleTag = displayMode === 'inline' ? 'h1' : 'h2';
  const panelContent = (
    <div
      className={
        displayMode === 'inline'
          ? 'w-full max-w-3xl rounded-3xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8'
          : 'bg-white p-8 rounded-lg shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto'
      }
    >
      <div className="flex justify-between items-center mb-4">
        <TitleTag className="text-2xl font-bold text-gray-900">Download Access</TitleTag>
        {displayMode === 'modal' && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
            aria-label="Close modal"
          >
            x
          </button>
        )}
      </div>

      <p className="text-sm text-gray-700 mb-4">
        Start for free today (no charge today).
        You get unlimited downloads for {trialDays} days.
      </p>

      {isLoggedIn && normalizedCurrentEmail && (
        <p className="text-sm text-gray-700 mb-4">
          Logged in as <span className="font-medium">{normalizedCurrentEmail}</span>
        </p>
      )}

      {!isLoggedIn && (
        <div className="space-y-4">
          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              value={registerEmail}
              onChange={(e) => handleEmailChange(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              placeholder="Enter your email"
              aria-label="Email"
              disabled={isProcessing}
              required
            />
          </div>

          <div>
            <label htmlFor="confirm-email" className="block text-sm font-medium text-gray-700">
              Confirm Email
            </label>
            <input
              id="confirm-email"
              type="email"
              value={confirmEmail}
              onChange={(e) => handleConfirmEmailChange(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              placeholder="Confirm your email"
              aria-label="Confirm Email"
              disabled={isProcessing}
              required
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="register-password"
              type="password"
              value={registerPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              placeholder="Enter your password"
              aria-label="Password"
              disabled={isProcessing}
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-gray-700"
            >
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              placeholder="Confirm your password"
              aria-label="Confirm Password"
              disabled={isProcessing}
              required
            />
          </div>
        </div>
      )}

      <div className="flex items-center mt-4">
        <input
          id="receive-updates"
          type="checkbox"
          checked={receiveUpdates}
          onChange={(e) => setReceiveUpdates(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          disabled={isProcessing}
        />
        <label htmlFor="receive-updates" className="ml-2 block text-sm text-gray-700">
          Send me updates on new designs
        </label>
      </div>

      {isCheckingSubscription && isValidEmail(effectiveEmail) && (
        <p className="text-gray-600 text-sm text-center mt-4" role="status">
          Checking subscription status...
        </p>
      )}

      {hasActiveSubscription && (
        <p className="text-green-700 text-sm text-center mt-4" role="status">
          Subscription active. You have unlimited downloads.
        </p>
      )}

      {!hasActiveSubscription && trialStatus?.status === 'ACTIVE' && (
        <p className="text-blue-700 text-sm text-center mt-4" role="status">
          Trial active.
        </p>
      )}

      {!hasActiveSubscription && trialStatus?.status === 'EXPIRED' && (
        <p className="text-amber-700 text-sm text-center mt-4" role="status">
          Trial expired. Subscribe for unlimited access.
        </p>
      )}

      {!hasActiveSubscription && subscriptionStatus?.status === 'INACTIVE_RECORDED' && (
        <p className="text-amber-700 text-sm text-center mt-4" role="status">
          Subscription expired. Renew to continue.
        </p>
      )}

      {errorMessage && (
        <p className="text-red-500 text-sm text-center mt-4" role="alert">
          {errorMessage}
        </p>
      )}

      {infoMessage && (
        <p className="text-green-700 text-sm text-center mt-4" role="status">
          {infoMessage}
        </p>
      )}

      {!hasActiveSubscription && canStartTrial && (
        <button
          type="button"
          onClick={() => {
            void handleStartTrial();
          }}
          disabled={isProcessing || isCheckingSubscription || !isFormValid}
          className="mt-5 w-full rounded-md bg-gray-700 px-3 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Start for Free
        </button>
      )}

      {!hasActiveSubscription && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Choose a Subscription Plan</h3>
          <p className="text-sm text-gray-600 mb-3">
            Both plans begin with a free {trialDays}-day trial.
          </p>
          {plans.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedPlanId === plan.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  } ${plan.recommended ? 'border-2 border-blue-500' : ''}`}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  {plan.recommended && (
                    <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                      Recommended
                    </span>
                  )}
                  <h4 className="text-lg font-semibold">{plan.name}</h4>
                  <p className="text-xl font-bold text-gray-900">{plan.price}</p>
                  <p className="text-sm text-gray-600">Billed {plan.interval}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center">Loading payment plans...</p>
          )}
        </div>
      )}

      {!hasActiveSubscription && !hasPayPalClientId && (
        <p className="text-red-500 text-sm text-center mt-4" role="alert">
          Payment configuration error: missing NEXT_PUBLIC_PAYPAL_CLIENT_ID.
        </p>
      )}

      {selectedPlanId &&
        isFormValid &&
        !hasActiveSubscription &&
        !isCheckingSubscription &&
        hasPayPalClientId && (
          <div className="mt-4">
            <PayPalButtons
              createSubscription={handlePayPalSubscription}
              onApprove={handlePayPalApprove}
              onError={(error) => {
                console.error('PayPal error:', error);
                setErrorMessage('Failed to process payment. Please try again.');
                setIsProcessing(false);
              }}
              style={{ layout: 'vertical' }}
              disabled={isProcessing}
            />
          </div>
        )}

      {!isLoggedIn && !hideLoginPrompt && (
        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button
            onClick={onLoginClick}
            className="px-2 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm"
            aria-label="Login"
            disabled={isProcessing}
          >
            Login
          </button>
        </p>
      )}
    </div>
  );

  return (
    <PayPalScriptProvider
      options={{
        clientId: hasPayPalClientId ? clientId : 'test',
        vault: true,
        intent: 'subscription',
      }}
    >
      {displayMode === 'modal' ? (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)' }}
        >
          {panelContent}
        </div>
      ) : (
        panelContent
      )}
    </PayPalScriptProvider>
  );
}
