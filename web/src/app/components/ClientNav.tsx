'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthControl } from '@/app/components/AuthControl';

export default function ClientNav() {
  const [isArticlesOpenDesktop, setIsArticlesOpenDesktop] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isArticlesOpenMobile, setIsArticlesOpenMobile] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    setIsArticlesOpenMobile(false);
  };

  const desktopLinkBase =
    'inline-flex items-center text-gray-800 hover:text-blue-700 hover:underline border-b-2 border-transparent hover:border-blue-600 font-medium text-xl';

  const mobileLinkBase =
    'block text-gray-800 hover:text-blue-700 hover:underline font-medium text-base';

  const mobileSubLinkBase =
    'block text-gray-700 hover:text-blue-700 hover:underline text-sm pl-3 py-0.5';

  return (
    <nav
      className="bg-white border-b border-gray-200 py-4 shadow-md"
      aria-label="Main navigation"
    >
      {/* Top bar */}
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Desktop navigation */}
        <div className="hidden md:flex items-center space-x-2">
          <Link href="/" className={desktopLinkBase}>
            Home
          </Link>
          <span className="text-gray-400 text-xl">&middot;</span>
          <Link href="/XStitch-Charts.aspx" className={desktopLinkBase}>
            Thematic catalog
          </Link>
          <span className="text-gray-400 text-xl">&middot;</span>
          <Link href="/CrossStitchTips.aspx" className={desktopLinkBase}>
            Tips
          </Link>
          <span className="text-gray-400 text-xl">&middot;</span>
          <Link href="/short-stories" className={desktopLinkBase}>
            My thoughts
          </Link>
          <span className="text-gray-400 text-xl">&middot;</span>

          {/* Desktop Articles dropdown */}
          <div className="relative">
            <button
              onClick={() =>
                setIsArticlesOpenDesktop((prev) => !prev)
              }
              className={`${desktopLinkBase} focus:outline-none`}
              type="button"
            >
              Articles
            </button>
            {isArticlesOpenDesktop && (
              <div
                style={{ width: '256px' }}
                className="absolute left-0 mt-2 bg-white border border-gray-200 rounded-md shadow-lg z-10"
              >
                <Link
                  href="/Embroidery_History.aspx"
                  className="block px-4 py-2 text-gray-800 hover:bg-gray-100 hover:underline"
                  onClick={() => setIsArticlesOpenDesktop(false)}
                >
                  The History of Embroidery
                </Link>
                <hr />
                <Link
                  href="/WhyCrossStitch"
                  className="block px-4 py-2 text-gray-800 hover:bg-gray-100 hover:underline"
                  onClick={() => setIsArticlesOpenDesktop(false)}
                >
                  Why Cross-Stitch?
                </Link>
                <hr />
                <Link
                  href="/Article070409.aspx"
                  className="block px-4 py-2 text-gray-800 hover:bg-gray-100 hover:underline"
                  onClick={() => setIsArticlesOpenDesktop(false)}
                >
                  Men and Cross-Stitch
                </Link>
                <hr />
                <Link
                  href="/exercises"
                  className="block px-4 py-2 text-gray-800 hover:bg-gray-100 hover:underline"
                  onClick={() => setIsArticlesOpenDesktop(false)}
                >
                  Exercises for cross-stitchers
                </Link>
              </div>
            )}
          </div>
        </div>        {/* Right side: AuthControl (desktop) + burger (mobile) */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <AuthControl />
          </div>

          {/* Burger for mobile */}
          <button
            type="button"
            className="md:hidden p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
            onClick={toggleMobileMenu}
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? (
              // Close icon
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              // Burger icon
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white mt-2">
          <div className="container mx-auto px-4 py-4 space-y-4">
            {/* Top-level mobile links */}
            <div className="flex flex-col gap-2">
              <Link
                href="/"
                className={mobileLinkBase}
                onClick={closeMobileMenu}
              >
                Home
              </Link>
              <Link
                href="/XStitch-Charts.aspx"
                className={mobileLinkBase}
                onClick={closeMobileMenu}
              >
                Thematic catalog
              </Link>
              <Link
                href="/CrossStitchTips.aspx"
                className={mobileLinkBase}
                onClick={closeMobileMenu}
              >
                Tips
              </Link>
              <Link
                href="/short-stories"
                className={mobileLinkBase}
                onClick={closeMobileMenu}
              >
                My thoughts
              </Link>

              {/* Articles as submenu on mobile */}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() =>
                    setIsArticlesOpenMobile((prev) => !prev)
                  }
                  className={`${mobileLinkBase} flex items-center justify-between w-full`}
                >
                  <span>Articles</span>
                  <span className="text-gray-500 text-sm">
                    {isArticlesOpenMobile ? '▲' : '▼'}
                  </span>
                </button>

                {isArticlesOpenMobile && (
                  <div className="mt-1 ml-2 border-l border-gray-200 pl-2">
                    <Link
                      href="/Embroidery_History.aspx"
                      className={mobileSubLinkBase}
                      onClick={closeMobileMenu}
                    >
                      The History of Embroidery
                    </Link>
                    <Link
                      href="/WhyCrossStitch"
                      className={mobileSubLinkBase}
                      onClick={closeMobileMenu}
                    >
                      Why Cross-Stitch?
                    </Link>
                    <Link
                      href="/Article070409.aspx"
                      className={mobileSubLinkBase}
                      onClick={closeMobileMenu}
                    >
                      Men and Cross-Stitch
                    </Link>
                    <Link
                      href="/exercises"
                      className={mobileSubLinkBase}
                      onClick={closeMobileMenu}
                    >
                      Exercises for cross-stitchers
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* AuthControl for mobile */}
            <div className="pt-3 border-t border-gray-200">
              <AuthControl />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
