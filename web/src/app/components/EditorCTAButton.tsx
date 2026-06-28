'use client';

interface Props {
  href: string;
  label: string;
  eventName: string;
  eventParams?: Record<string, unknown>;
  className?: string;
}

export default function EditorCTAButton({ href, label, eventName, eventParams, className }: Props) {
  function handleClick() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.('event', eventName, eventParams);
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
    >
      {label}
    </a>
  );
}
