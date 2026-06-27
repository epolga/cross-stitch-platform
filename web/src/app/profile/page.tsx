'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isUserLoggedIn } from '@/app/components/AuthControl';

function readCurrentFirstName(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('userFirstName') || '').trim();
}

export default function ProfilePage() {
  const router = useRouter();
  const [hasResolvedAuth, setHasResolvedAuth] = useState(false);
  const [hadPrivateAccess, setHadPrivateAccess] = useState(false);
  const [isLoggedInState, setIsLoggedInState] = useState(false);
  const [currentFirstName, setCurrentFirstName] = useState('');
  const [votesCount, setVotesCount] = useState<number | null>(null);
  const [patternsCount, setPatternsCount] = useState<number | null>(null);

  useEffect(() => {
    const syncAuthState = () => {
      setIsLoggedInState(isUserLoggedIn());
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
    if (!hasResolvedAuth) return;
    if (isLoggedInState) { setHadPrivateAccess(true); return; }
    router.replace(hadPrivateAccess ? '/?from=profile-logout' : '/');
  }, [hasResolvedAuth, isLoggedInState, hadPrivateAccess, router]);

  useEffect(() => {
    if (!hasResolvedAuth || !isLoggedInState) return;

    const email = typeof window !== 'undefined' ? (localStorage.getItem('userEmail') || '') : '';

    fetch('/api/profile/votes?includeDesigns=false', {
      cache: 'no-store',
      headers: { 'x-user-email': email },
    })
      .then(r => r.json() as Promise<{ votesCount?: number }>)
      .then(d => setVotesCount(d.votesCount ?? 0))
      .catch(() => setVotesCount(0));

    fetch('/api/converter/patterns/my', { cache: 'no-store' })
      .then(r => r.json() as Promise<{ patterns?: unknown[] }>)
      .then(d => setPatternsCount(d.patterns?.length ?? 0))
      .catch(() => setPatternsCount(0));
  }, [hasResolvedAuth, isLoggedInState]);

  if (!hasResolvedAuth || !isLoggedInState) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col px-4 py-10">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-gray-900">Redirecting...</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col px-4 py-10">
      <section className="rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
          Private profile
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-900">
          {currentFirstName ? `Hi, ${currentFirstName}!` : 'Your profile'}
        </h1>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/profile/votes"
          className="flex flex-col rounded-3xl border border-amber-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-700">Voted designs</span>
          <span className="mt-2 text-4xl font-bold text-gray-900">
            {votesCount === null ? '…' : votesCount}
          </span>
          <span className="mt-1 text-sm text-gray-500">
            {votesCount === 1 ? 'rated design' : 'rated designs'}
          </span>
          <span className="mt-5 inline-flex w-fit rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-50">
            View all →
          </span>
        </Link>

        <Link
          href="/profile/patterns"
          className="flex flex-col rounded-3xl border border-rose-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-sm font-semibold uppercase tracking-[0.15em] text-rose-700">Saved patterns</span>
          <span className="mt-2 text-4xl font-bold text-gray-900">
            {patternsCount === null ? '…' : patternsCount}
          </span>
          <span className="mt-1 text-sm text-gray-500">
            {patternsCount === 1 ? 'saved pattern' : 'saved patterns'}
          </span>
          <span className="mt-5 inline-flex w-fit rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50">
            View all →
          </span>
        </Link>
      </section>
    </main>
  );
}
