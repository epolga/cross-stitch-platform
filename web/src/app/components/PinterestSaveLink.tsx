'use client';

import { useState, type CSSProperties } from 'react';

type Props = {
  href: string;
  designId: number;
  designCaption: string;
  className?: string;
  label?: string;
  trackingMode?: 'create_pin' | 'existing_pin';
  compact?: boolean;
  style?: CSSProperties;
};

function PinterestGlyph({ color, size }: { color: string; size: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{ display: 'block', width: size, height: size, fill: color }}
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.239 2.64 7.86 6.364 9.318-.088-.79-.167-2.004.035-2.868.182-.782 1.172-4.98 1.172-4.98s-.299-.598-.299-1.482c0-1.388.805-2.425 1.808-2.425.853 0 1.264.641 1.264 1.409 0 .858-.546 2.141-.828 3.331-.236.997.5 1.809 1.483 1.809 1.779 0 3.149-1.876 3.149-4.584 0-2.396-1.722-4.073-4.181-4.073-2.849 0-4.521 2.137-4.521 4.346 0 .861.331 1.785.744 2.286.082.1.094.188.07.289-.076.318-.244.997-.277 1.136-.044.182-.146.221-.338.133-1.261-.587-2.05-2.431-2.05-3.915 0-3.188 2.316-6.114 6.676-6.114 3.505 0 6.232 2.499 6.232 5.84 0 3.484-2.196 6.288-5.244 6.288-1.024 0-1.988-.532-2.317-1.163l-.63 2.4c-.228.879-.844 1.982-1.257 2.655.946.292 1.947.451 2.985.451 5.523 0 10-4.477 10-10S17.523 2 12 2Z" />
    </svg>
  );
}

export default function PinterestSaveLink({
  href,
  designId,
  designCaption,
  className,
  label = 'Save on Pinterest',
  trackingMode = 'create_pin',
  compact = false,
  style,
}: Props) {
  const [isHovered, setIsHovered] = useState(false);

  const resolvedStyle: CSSProperties | undefined = compact
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
        transform: isHovered ? 'translateY(-2px) scale(1.25)' : 'translateY(0) scale(1)',
        transformOrigin: 'center',
        transition: 'transform 150ms ease-out',
        ...style,
      }
    : style;

  const handleClick = () => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
      return;
    }

    window.gtag('event', 'pinterest_share_click', {
      event_category: 'engagement',
      event_label: designCaption,
      method: 'pinterest',
      content_type: 'design',
      item_id: String(designId),
      item_name: designCaption,
      destination_url: href,
      pinterest_target: trackingMode,
    });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={resolvedStyle}
      aria-label={`${label} for ${designCaption}`}
      title={label}
      onClick={handleClick}
      onMouseEnter={compact ? () => setIsHovered(true) : undefined}
      onMouseLeave={compact ? () => setIsHovered(false) : undefined}
    >
      {compact ? (
        <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
          <PinterestGlyph color="#BD081C" size="1.75rem" />
        </span>
      ) : (
        <>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15" aria-hidden="true">
            <PinterestGlyph color="#FFFFFF" size="1.5rem" />
          </span>
          <span className="flex flex-col text-left leading-tight">
            <span className="text-base font-semibold">{label}</span>
            <span className="text-xs font-medium text-white/80">Pin this pattern for later</span>
          </span>
        </>
      )}
    </a>
  );
}