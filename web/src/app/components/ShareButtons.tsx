'use client';

import { useState, type CSSProperties } from 'react';

type Props = {
  pageUrl: string;
  designId: number;
  designCaption: string;
  className?: string;
};

function iconButtonStyle(hovered: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: hovered ? 'translateY(-2px) scale(1.25)' : 'translateY(0) scale(1)',
    transformOrigin: 'center',
    transition: 'transform 150ms ease-out',
  };
}

function FacebookGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '1.75rem', height: '1.75rem', fill: '#1877F2' }}>
      <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.507 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.878h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94Z" />
    </svg>
  );
}

function XGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '1.5rem', height: '1.5rem', fill: '#000000' }}>
      <path d="M18.244 2H21.5l-7.29 8.33L23 22h-6.828l-5.35-6.66L4.7 22H1.44l7.8-8.91L1 2h6.997l4.83 6.09L18.244 2Zm-1.197 18h1.803L7.06 3.89H5.14L17.047 20Z" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '1.75rem', height: '1.75rem', fill: '#25D366' }}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.33 4.95L2 22l5.27-1.38a9.9 9.9 0 0 0 4.77 1.21h.01c5.46 0 9.9-4.44 9.9-9.9C21.96 6.45 17.5 2 12.04 2Zm5.8 14.1c-.24.68-1.4 1.3-1.94 1.36-.5.06-1.05.09-1.7-.1-.39-.12-.9-.29-1.54-.57-2.72-1.17-4.49-3.9-4.63-4.08-.14-.18-1.1-1.46-1.1-2.79 0-1.32.7-1.97.94-2.24.24-.27.53-.34.7-.34l.5.01c.16 0 .38-.06.59.45.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.3.47-.15.16-.31.36-.44.48-.15.15-.3.31-.13.6.17.29.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.45.29.15.46.12.63-.07.17-.19.72-.84.92-1.13.19-.28.38-.24.64-.14.27.1 1.68.79 1.97.93.29.15.48.22.55.34.07.13.07.72-.17 1.4Z" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '1.5rem', height: '1.5rem', fill: 'none', stroke: '#4b5563', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.14 1.13" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.13-1.14" />
    </svg>
  );
}

export default function ShareButtons({ pageUrl, designId, designCaption, className }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function track(method: string) {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    window.gtag('event', 'share_click', {
      event_category: 'engagement',
      method,
      content_type: 'design',
      item_id: String(designId),
      item_name: designCaption,
    });
  }

  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedText = encodeURIComponent(`${designCaption} — free cross-stitch pattern`);

  const links: Array<{ key: string; href: string; label: string; glyph: React.ReactNode }> = [
    {
      key: 'facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      label: 'Share on Facebook',
      glyph: <FacebookGlyph />,
    },
    {
      key: 'x',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      label: 'Share on X',
      glyph: <XGlyph />,
    },
    {
      key: 'whatsapp',
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      label: 'Share on WhatsApp',
      glyph: <WhatsAppGlyph />,
    },
  ];

  async function handleCopyLink() {
    track('copy_link');
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silently ignore, nothing to fall back to
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 shrink-0"
          style={iconButtonStyle(hovered === link.key)}
          onMouseEnter={() => setHovered(link.key)}
          onMouseLeave={() => setHovered(null)}
          aria-label={`${link.label} for ${designCaption}`}
          title={link.label}
          onClick={() => track(link.key)}
        >
          {link.glyph}
        </a>
      ))}
      <button
        type="button"
        className="h-8 w-8 shrink-0 relative"
        style={iconButtonStyle(hovered === 'copy')}
        onMouseEnter={() => setHovered('copy')}
        onMouseLeave={() => setHovered(null)}
        aria-label={`Copy link to ${designCaption}`}
        title="Copy link"
        onClick={handleCopyLink}
      >
        <LinkGlyph />
        {copied && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white">
            Copied!
          </span>
        )}
      </button>
    </div>
  );
}
