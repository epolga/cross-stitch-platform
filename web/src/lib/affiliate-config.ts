export interface AffiliateStoreUrls {
  lovecrafts: string | null;
  amazon: string | null;
}

export function getAffiliateStoreUrls(): AffiliateStoreUrls {
  return {
    lovecrafts: process.env.NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_URL || null,
    amazon: process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_URL || null,
  };
}

export function hasAnyAffiliateStore(urls: AffiliateStoreUrls): boolean {
  return !!(urls.lovecrafts || urls.amazon);
}
