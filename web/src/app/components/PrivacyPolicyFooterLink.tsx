'use client';

import { usePathname } from 'next/navigation';

export default function PrivacyPolicyFooterLink() {
  const pathname = usePathname();

  if (pathname.startsWith('/privacy-policy')) {
    return null;
  }

  return (
    <p className="mt-2">
      <a
        className="text-blue-600 hover:underline"
        href="https://cross-stitch.com/privacy-policy"
        aria-label="Open privacy policy"
      >
        Privacy Policy
      </a>
    </p>
  );
}
