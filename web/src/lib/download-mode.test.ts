import { afterEach, describe, expect, it } from 'vitest';
import { normalizeDownloadMode, resolveServerDownloadMode } from './download-mode';

const originalDownloadMode = process.env.DOWNLOAD_MODE;
const originalPublicDownloadMode = process.env.NEXT_PUBLIC_DOWNLOAD_MODE;

afterEach(() => {
  if (originalDownloadMode === undefined) {
    delete process.env.DOWNLOAD_MODE;
  } else {
    process.env.DOWNLOAD_MODE = originalDownloadMode;
  }

  if (originalPublicDownloadMode === undefined) {
    delete process.env.NEXT_PUBLIC_DOWNLOAD_MODE;
  } else {
    process.env.NEXT_PUBLIC_DOWNLOAD_MODE = originalPublicDownloadMode;
  }
});

describe('normalizeDownloadMode', () => {
  it('keeps known values', () => {
    expect(normalizeDownloadMode('free')).toBe('free');
    expect(normalizeDownloadMode('register')).toBe('register');
    expect(normalizeDownloadMode('paid')).toBe('paid');
  });

  it('falls back to register for unknown values', () => {
    expect(normalizeDownloadMode('unexpected')).toBe('register');
    expect(normalizeDownloadMode(undefined)).toBe('register');
  });
});

describe('resolveServerDownloadMode', () => {
  it('prefers DOWNLOAD_MODE over NEXT_PUBLIC_DOWNLOAD_MODE', () => {
    process.env.DOWNLOAD_MODE = 'paid';
    process.env.NEXT_PUBLIC_DOWNLOAD_MODE = 'free';

    expect(resolveServerDownloadMode()).toBe('paid');
  });

  it('uses public mode when server mode is missing', () => {
    delete process.env.DOWNLOAD_MODE;
    process.env.NEXT_PUBLIC_DOWNLOAD_MODE = 'register';

    expect(resolveServerDownloadMode()).toBe('register');
  });
});
