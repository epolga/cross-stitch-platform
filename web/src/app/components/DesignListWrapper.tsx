'use client';

import { useState, useEffect } from 'react';
import { DesignList } from './DesignList';
import { isUserLoggedIn } from './AuthControl';
import type { Design } from '@/app/types/design';

interface DesignListWrapperProps {
  designs: Design[];
  page: number;
  totalPages: number;
  pageSize: number;
  baseUrl?: string;
  caption?: string;
  className?: string;
}

export function DesignListWrapper({
  designs,
  page,
  totalPages,
  pageSize,
  baseUrl,
  caption,
  className,
}: DesignListWrapperProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Initialize to false for SSR

  useEffect(() => {
    // Initialize login state (client-side only)
    if (typeof window !== 'undefined') {
      setIsLoggedIn(isUserLoggedIn());
      console.log('DesignListWrapper mounted, isLoggedIn:', isUserLoggedIn());

      // Handle storage events for cross-tab updates
      const handleStorageChange = (e: StorageEvent) => {
        console.log('Storage event detected:', e);
        if (e.key === 'isLoggedIn') {
          const newLoginState = e.newValue === 'true';
          setIsLoggedIn(newLoginState);
          console.log('Storage event: isLoggedIn updated to', newLoginState);
        }
      };

      // Handle custom auth state change event for same-tab updates
      const handleAuthStateChange = () => {
        const newLoginState = isUserLoggedIn();
        setIsLoggedIn(newLoginState);
        console.log('Auth state change event: isLoggedIn updated to', newLoginState);
      };

      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('authStateChange', handleAuthStateChange);

      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('authStateChange', handleAuthStateChange);
      };
    }
  }, []);

  return (
    <DesignList
      designs={designs}
      page={page}
      totalPages={totalPages}
      pageSize={pageSize}
      baseUrl={baseUrl}
      caption={caption}
      className={className}
      isLoggedIn={isLoggedIn}
    />
  );
}