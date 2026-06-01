// src/lib/UrlHelper.ts

import { Design } from "@/app/types/design";

export function normalizeBaseUrl(input: string): string {
  let url = input.trim();

  // Force https
  url = url.replace(/^http:\/\//i, "https://");

  // Remove trailing slashes
  url = url.replace(/\/+$/, "");

  // Remove default HTTPS port
  url = url.replace(/:443$/i, "");

  // Safety net in production
  if (process.env.NODE_ENV === "production" &&
      url.includes("cross-stitch-pattern.net")) {
    url = "https://cross-stitch.com";
  }

  return url;
}


export function getSiteBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cross-stitch.com');
}

export function buildCanonicalUrl(path = '/'): string {
  const base = getSiteBaseUrl();
  if (!path || path === '/') return `${base}/`;
  if (/^https?:\/\//i.test(path)) return normalizeBaseUrl(path);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getSiteHostname(): string {
  const base = getSiteBaseUrl();
  try {
    return new URL(base).hostname;
  } catch {
    return base.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }
}

export function buildSiteEmail(localPart: string): string {
  const hostname = getSiteHostname().replace(/^www\./i, '');
  return `${localPart}@${hostname}`;
}

// Helper to create design URL based on Caption, AlbumId, and NPage
export function CreateDesignUrl(
 Design: Design
): string {
    const formattedCaption = Design.Caption.replace(/\s+/g, '-');
  return `/${formattedCaption}-${Design.AlbumID}-${Design.NPage-1}-Free-Design.aspx`;
}  

// Helper to create image URL based on Caption and DesignId
export function CreateImageUrl(
  Caption: string, 
  DesignId: number, 
): string {
    const formattedCaption = Caption.replace(/\s+/g, '-');
    return `/${formattedCaption}-${DesignId}-S-Free-Design.jpg`;
} 

// Helper to create album URL based on AlbumId
export function CreateAlbumUrl(
  Caption:string)
  : string{
  const formattedCaption = Caption?.replace(/\s+/g, '-');
  return `/Free-${formattedCaption}-Charts.aspx`;
}
    
