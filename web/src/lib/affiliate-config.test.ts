import { afterEach, describe, expect, it } from 'vitest';
import { getAffiliateStoreUrls, hasAnyAffiliateStore } from './affiliate-config';

const LOVECRAFTS_KEY = 'NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_URL';
const AMAZON_KEY = 'NEXT_PUBLIC_AMAZON_AFFILIATE_URL';

const originalLovecrafts = process.env[LOVECRAFTS_KEY];
const originalAmazon = process.env[AMAZON_KEY];

afterEach(() => {
  if (originalLovecrafts === undefined) {
    delete process.env[LOVECRAFTS_KEY];
  } else {
    process.env[LOVECRAFTS_KEY] = originalLovecrafts;
  }
  if (originalAmazon === undefined) {
    delete process.env[AMAZON_KEY];
  } else {
    process.env[AMAZON_KEY] = originalAmazon;
  }
});

describe('getAffiliateStoreUrls', () => {
  it('returns null for both stores when env vars are not set', () => {
    delete process.env[LOVECRAFTS_KEY];
    delete process.env[AMAZON_KEY];

    const result = getAffiliateStoreUrls();
    expect(result.lovecrafts).toBeNull();
    expect(result.amazon).toBeNull();
  });

  it('returns the LoveCrafts URL when set', () => {
    process.env[LOVECRAFTS_KEY] = 'https://www.lovecrafts.com/en-gb?tag=test';
    delete process.env[AMAZON_KEY];

    const result = getAffiliateStoreUrls();
    expect(result.lovecrafts).toBe('https://www.lovecrafts.com/en-gb?tag=test');
    expect(result.amazon).toBeNull();
  });

  it('returns the Amazon URL when set', () => {
    delete process.env[LOVECRAFTS_KEY];
    process.env[AMAZON_KEY] = 'https://www.amazon.com/s?k=cross+stitch&tag=test-20';

    const result = getAffiliateStoreUrls();
    expect(result.lovecrafts).toBeNull();
    expect(result.amazon).toBe('https://www.amazon.com/s?k=cross+stitch&tag=test-20');
  });

  it('returns both URLs when both are set', () => {
    process.env[LOVECRAFTS_KEY] = 'https://www.lovecrafts.com/?tag=a';
    process.env[AMAZON_KEY] = 'https://www.amazon.com/?tag=b';

    const result = getAffiliateStoreUrls();
    expect(result.lovecrafts).toBe('https://www.lovecrafts.com/?tag=a');
    expect(result.amazon).toBe('https://www.amazon.com/?tag=b');
  });

  it('treats empty string as unconfigured', () => {
    process.env[LOVECRAFTS_KEY] = '';
    process.env[AMAZON_KEY] = '';

    const result = getAffiliateStoreUrls();
    expect(result.lovecrafts).toBeNull();
    expect(result.amazon).toBeNull();
  });
});

describe('hasAnyAffiliateStore', () => {
  it('returns false when no stores are configured', () => {
    expect(hasAnyAffiliateStore({ lovecrafts: null, amazon: null })).toBe(false);
  });

  it('returns true when only LoveCrafts is configured', () => {
    expect(hasAnyAffiliateStore({ lovecrafts: 'https://example.com', amazon: null })).toBe(true);
  });

  it('returns true when only Amazon is configured', () => {
    expect(hasAnyAffiliateStore({ lovecrafts: null, amazon: 'https://example.com' })).toBe(true);
  });

  it('returns true when both stores are configured', () => {
    expect(hasAnyAffiliateStore({ lovecrafts: 'https://lc.com', amazon: 'https://amzn.com' })).toBe(true);
  });
});
