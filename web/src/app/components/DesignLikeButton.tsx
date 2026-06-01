'use client';

import { useEffect, useState } from 'react';
import { USER_VOTES_CHANGED_EVENT, isUserLoggedIn } from '@/app/components/AuthControl';

type Props = {
  designId: number;
};

type LikeState = {
  count: number;
  currentUserVote: 'up' | 'down' | null;
};

function readUserEmail(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('userEmail') || '').trim().toLowerCase();
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm18 10-6 6-6-6'}
      />
    </svg>
  );
}

export default function DesignLikeButton({ designId }: Props) {
  const [isLoggedInState, setIsLoggedInState] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [count, setCount] = useState(0);
  const [currentUserVote, setCurrentUserVote] = useState<'up' | 'down' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasPositiveVotes = count > 0;
  const containerClasses = hasPositiveVotes
    ? 'border-rose-200 bg-rose-50'
    : 'border-sky-200 bg-sky-50';
  const countClasses = hasPositiveVotes
    ? 'bg-rose-100 text-rose-700'
    : 'bg-sky-100 text-sky-700';

  useEffect(() => {
    const syncAuth = () => {
      setIsLoggedInState(isUserLoggedIn());
      setUserEmail(readUserEmail());
    };

    syncAuth();
    window.addEventListener('authStateChange', syncAuth as EventListener);
    window.addEventListener('storage', syncAuth);

    return () => {
      window.removeEventListener('authStateChange', syncAuth as EventListener);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLikeState = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (userEmail) {
          params.set('email', userEmail);
        }
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`/api/designs/${designId}/like${suffix}`, {
          cache: 'no-store',
        });
        const data = (await response.json()) as Partial<LikeState> & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load like state');
        }
        if (isMounted) {
          setCount(data.count ?? 0);
          setCurrentUserVote(data.currentUserVote ?? null);
        }
      } catch (error) {
        console.error('[DesignLikeButton] Failed to load like state:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadLikeState();

    return () => {
      isMounted = false;
    };
  }, [designId, userEmail]);

  const handleVoteClick = async (direction: 'up' | 'down') => {
    if (!isLoggedInState || !userEmail) {
      window.dispatchEvent(new Event('openLoginModal'));
      return;
    }

    if (currentUserVote === direction) {
      return;
    }

    setIsSubmitting(true);

    const previousVote = currentUserVote;
    const nextVote = previousVote === null ? direction : null;
    const previousDelta = previousVote === 'up' ? 1 : previousVote === 'down' ? -1 : 0;
    const nextDelta = nextVote === 'up' ? 1 : nextVote === 'down' ? -1 : 0;
    setCurrentUserVote(nextVote);
    setCount((previous) => previous - previousDelta + nextDelta);

    try {
      const response = await fetch(`/api/designs/${designId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, direction }),
      });
      const data = (await response.json()) as Partial<LikeState> & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update like state');
      }
      setCount(data.count ?? 0);
      setCurrentUserVote(data.currentUserVote ?? null);
      window.dispatchEvent(new Event(USER_VOTES_CHANGED_EVENT));
    } catch (error) {
      console.error('[DesignLikeButton] Failed to update vote state:', error);
      setCurrentUserVote(previousVote);
      setCount((previous) => previous + previousDelta - nextDelta);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`inline-flex min-h-[118px] w-[92px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center shadow-sm ${containerClasses}`}
      style={{ marginLeft: 'auto' }}
      aria-label="Pattern voting controls"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">
        Vote
      </span>
      <button
        type="button"
        className={`rounded-md p-1 transition ${
          currentUserVote === 'up'
            ? 'bg-rose-100 text-rose-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800'
        } ${isSubmitting ? 'opacity-70' : ''}`}
        onClick={() => handleVoteClick('up')}
        disabled={isSubmitting || isLoading}
        aria-label="Up vote this design"
        title={isLoggedInState ? 'Up vote this design' : 'Log in to vote'}
      >
        <ArrowIcon direction="up" />
      </button>
      <span
        className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-xs font-semibold ${countClasses}`}
      >
        {count}
      </span>
      <button
        type="button"
        className={`rounded-md p-1 transition ${
          currentUserVote === 'down'
            ? 'bg-slate-200 text-slate-700'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800'
        } ${isSubmitting ? 'opacity-70' : ''}`}
        onClick={() => handleVoteClick('down')}
        disabled={isSubmitting || isLoading}
        aria-label="Down vote this design"
        title={isLoggedInState ? 'Down vote this design' : 'Log in to vote'}
      >
        <ArrowIcon direction="down" />
      </button>
      <span className="text-[10px] leading-tight text-gray-500">
        Rate this pattern
      </span>
    </div>
  );
}
