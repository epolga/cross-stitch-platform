'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isUserLoggedIn } from './AuthControl';

interface Props {
  className?: string;
}

export default function RegisterNewsletterLink({ className }: Props) {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const updateLoginState = () => setLoggedIn(isUserLoggedIn());
    updateLoginState();

    const handleAuthChange = () => updateLoginState();
    window.addEventListener('authStateChange', handleAuthChange);

    return () => {
      window.removeEventListener('authStateChange', handleAuthChange);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (isUserLoggedIn()) {
      router.push('/register-only');
      return;
    }

    const evt = new CustomEvent('openRegisterModal', {
      detail: {
        source: 'newsletter-cta',
        label: 'Homepage newsletter signup',
      },
    });
    window.dispatchEvent(evt);
  }, [router]);

  if (loggedIn) {
    return null;
  }

  return (
    <p className={className}>
      Sign up for my{' '}
      <button
        type="button"
        className="text-blue-600 hover:underline"
        onClick={handleClick}
      >
        free newsletter
      </button>{' '}
      to receive new free designs and PDF charts as they are released.
    </p>
  );
}
