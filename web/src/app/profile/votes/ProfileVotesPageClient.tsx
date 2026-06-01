'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreateDesignUrl } from '@/lib/url-helper';
import type { Design } from '@/app/types/design';
import { USER_VOTES_CHANGED_EVENT, isUserLoggedIn } from '@/app/components/AuthControl';

type VoteDirection = 'up' | 'down';

type VoteEntry = {
  designId: number;
  voteDirection: VoteDirection;
  createdAt?: string;
  updatedAt?: string;
  design: Design;
};

type VoteResponse = {
  votesCount?: number;
  votes?: VoteEntry[];
  error?: string;
};

function readCurrentEmail(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return (localStorage.getItem('userEmail') || '').trim().toLowerCase();
}

function readCurrentFirstName(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return (localStorage.getItem('userFirstName') || '').trim();
}

function formatVoteDate(value?: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProfileVotesPageClient() {
  const router = useRouter();
  const [hasResolvedAuth, setHasResolvedAuth] = useState(false);
  const [hadPrivateAccess, setHadPrivateAccess] = useState(false);
  const [isLoggedInState, setIsLoggedInState] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentFirstName, setCurrentFirstName] = useState('');
  const [votes, setVotes] = useState<VoteEntry[]>([]);
  const [votesCount, setVotesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const syncAuthState = () => {
      setIsLoggedInState(isUserLoggedIn());
      setCurrentEmail(readCurrentEmail());
      setCurrentFirstName(readCurrentFirstName());
      setHasResolvedAuth(true);
    };

    syncAuthState();
    window.addEventListener('authStateChange', syncAuthState as EventListener);
    window.addEventListener('storage', syncAuthState);

    return () => {
      window.removeEventListener('authStateChange', syncAuthState as EventListener);
      window.removeEventListener('storage', syncAuthState);
    };
  }, []);

  useEffect(() => {
    if (!hasResolvedAuth) {
      return;
    }

    if (isLoggedInState && currentEmail) {
      setHadPrivateAccess(true);
      return;
    }

    if (!isLoggedInState || !currentEmail) {
      router.replace(hadPrivateAccess ? '/?from=profile-logout' : '/');
    }
  }, [currentEmail, hadPrivateAccess, hasResolvedAuth, isLoggedInState, router]);

  useEffect(() => {
    if (!hasResolvedAuth) {
      return;
    }

    if (!isLoggedInState || !currentEmail) {
      setVotes([]);
      setVotesCount(0);
      setErrorMessage('');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadVotes = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/profile/votes', {
          cache: 'no-store',
          headers: {
            'x-user-email': currentEmail,
          },
        });
        const data = (await response.json().catch(() => ({}))) as VoteResponse;

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load voted designs');
        }

        if (!isMounted) {
          return;
        }

        setVotes(data.votes ?? []);
        setVotesCount(data.votesCount ?? 0);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('[ProfileVotesPageClient] Failed to load voted designs:', error);
        setVotes([]);
        setVotesCount(0);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load voted designs');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadVotes();
    window.addEventListener(USER_VOTES_CHANGED_EVENT, loadVotes as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(USER_VOTES_CHANGED_EVENT, loadVotes as EventListener);
    };
  }, [currentEmail, hasResolvedAuth, isLoggedInState]);

  if (!hasResolvedAuth || !isLoggedInState || !currentEmail) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col px-4 py-10">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-gray-900">Redirecting...</h1>
          <p className="mt-3 max-w-2xl text-base text-gray-600">
            This private page is only available while you are logged in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col px-4 py-10">
      <section className="rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
          Private profile
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-900">
          {currentFirstName ? `${currentFirstName}'s voted designs` : 'Your voted designs'}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-gray-700">
          This page lists the patterns you have already rated, so you can revisit them without
          searching again.
        </p>
        <div className="mt-6 inline-flex items-center rounded-full border border-amber-300 bg-white/80 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm">
          {votesCount} {votesCount === 1 ? 'rated design' : 'rated designs'}
        </div>
      </section>

      {isLoading ? (
        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-base text-gray-600">Loading your voted designs...</p>
        </section>
      ) : null}

      {!isLoading && errorMessage ? (
        <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-red-900">Unable to load your profile</h2>
          <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
        </section>
      ) : null}

      {!isLoading && !errorMessage && votesCount === 0 ? (
        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">No voted designs yet</h2>
          <p className="mt-2 text-base text-gray-600">
            Vote on any pattern and it will show up here automatically.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex w-fit rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
          >
            Browse patterns
          </Link>
        </section>
      ) : null}

      {!isLoading && !errorMessage && votes.length > 0 ? (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {votes.map((vote) => {
            const voteDate = formatVoteDate(vote.updatedAt || vote.createdAt);

            return (
              <article
                key={`${vote.designId}-${vote.voteDirection}`}
                className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link href={CreateDesignUrl(vote.design)} className="group block">
                  <div className="relative flex h-[220px] items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
                    {vote.design.ImageUrl ? (
                      <Image
                        src={vote.design.ImageUrl}
                        alt={vote.design.Caption}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        className="object-contain p-4 transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span className="text-sm text-gray-500">No image</span>
                    )}
                  </div>
                </Link>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      vote.voteDirection === 'up'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {vote.voteDirection === 'up' ? 'Up vote' : 'Down vote'}
                  </span>
                  {voteDate ? <span className="text-xs text-gray-500">{voteDate}</span> : null}
                </div>

                <h2 className="mt-4 text-xl font-semibold text-gray-900">{vote.design.Caption}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-gray-600">{vote.design.Description}</p>

                <div className="mt-5 pt-2">
                  <Link
                    href={CreateDesignUrl(vote.design)}
                    className="inline-flex rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:border-gray-900 hover:text-gray-900"
                  >
                    Open design
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}