# Analytics & SEO Tools Setup (GA4 + Semrush) for `cross-stitch.com`

This document is a **safe, step-by-step** checklist to set up:
- **Google Analytics 4 (GA4)**
- **Google Search Console (GSC)** (required for Semrush integrations)
- **Semrush Project(s)**

It is written for a **domain transition** from:
- old: `cross-stitch-pattern.net`
- new: `cross-stitch.com`

> Principle: **wire up measurement first**, then redirect/flip traffic.

---

## 0) Prerequisites (5 minutes)

- You can open:
  - Google Analytics
  - Google Search Console
  - Semrush
  - DNS management (Route 53 and/or Dynadot)
- You have access to the codebase / EB env vars.

Create/confirm a public email inbox for tooling notifications (optional).

---

## 1) Google Analytics 4 (GA4)

### 1.1 Decide the data model (recommended)
Use **one GA4 property** for the brand, to avoid splitting data across domains.

- Property name suggestion: `Cross Stitch`
- Primary website: `https://cross-stitch.com`

> During transition, we will configure **cross-domain measurement** so sessions don’t break.

### 1.2 Create / confirm a GA4 Web Data Stream
In GA:
- Admin → **Data streams** → Web
- Website URL: `https://cross-stitch.com`
- Stream name: `cross-stitch.com`

Copy the **Measurement ID** (looks like `G-XXXXXXXXXX`).

### 1.3 Add cross-domain measurement (important during migration)
In GA4:
- Admin → Data display → **Cross-domain measurement**
Add:
- `cross-stitch.com`
- `cross-stitch-pattern.net`

### 1.4 Implement GA in Next.js (App Router)
1) Add environment variable (Elastic Beanstalk env vars):
- `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX`

2) In `src/app/layout.tsx`, add GA scripts inside `<head>`:

```tsx
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { send_page_view: true });
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

> If you already have a `<head>` structure, keep it; just add these scripts in it.

### 1.5 Verify GA is firing (no guessing)
On `https://cross-stitch.com`:
- Chrome DevTools → **Network**
- Filter: `collect`
- You should see requests to:
  - `https://www.google-analytics.com/g/collect`

Also recommended:
- Install the **Google Tag Assistant** Chrome extension and verify GA4 is detected.

### 1.6 Optional: Events you likely want
- `sign_up` (registration)
- `login`
- `purchase` / `begin_checkout` (if relevant later)
- `download_pdf` (your key action)

---

## 2) Google Search Console (GSC)

### 2.1 Add BOTH domains as properties
Add:
- `cross-stitch-pattern.net`
- `cross-stitch.com`

Recommended type:
- **Domain property** (DNS verification)

> Keep both properties during the whole transition.

### 2.2 Verify ownership (DNS)
Follow Google’s instructions to add TXT records.
Confirm verification succeeds.

### 2.3 Submit sitemaps
In each property:
- `cross-stitch.com`: submit `https://cross-stitch.com/sitemap.xml` (or your actual sitemap URL)
- old domain: keep the old sitemap for monitoring while redirects are being rolled out

### 2.4 Monitor key reports
- Indexing → Pages
- Sitemaps
- Performance

> We will use GSC to confirm Google is discovering and indexing `cross-stitch.com`.

---

## 3) Semrush

### 3.1 Create a NEW project for the new domain
In Semrush:
- Create Project → `cross-stitch.com`

Enable:
- Site Audit
- Position Tracking (even if minimal initially)
- Backlink Audit (optional)

> Keep the old domain project separate for now.

### 3.2 Connect GA + GSC to Semrush
Inside the `cross-stitch.com` project:
- Integrations / Connections:
  - Connect to **Google Analytics**
  - Connect to **Google Search Console**

Select:
- the correct GA4 property
- the correct GSC property for `cross-stitch.com`

### 3.3 Configure Site Audit
- Crawl scope: start with standard settings
- Pages limit: choose a safe limit for the first crawl (so it finishes)
- If Semrush offers “domain vs subfolder” choices: pick **domain**

After first crawl:
- Fix obvious “critical” issues only (avoid huge refactors during migration).

### 3.4 Configure Position Tracking (minimum viable)
- Location: choose your primary market
- Device: Desktop + Mobile (or start with one)
- Keywords: start with 20–50 most important phrases

---

## 4) Migration-safe ordering (do this in this order)

1. ✅ GA installed and verified on `cross-stitch.com`
2. ✅ GSC property verified for `cross-stitch.com`
3. ✅ Sitemap submitted for `cross-stitch.com`
4. ✅ Semrush project created + connected
5. ✅ Only then: broaden redirects / canonical changes / “primary domain” switch

---

## 5) Quick checklist

### GA
- [ ] GA4 property exists
- [ ] Stream for `cross-stitch.com` created
- [ ] Cross-domain measurement configured
- [ ] `NEXT_PUBLIC_GA_ID` set in EB
- [ ] GA requests visible in DevTools

### GSC
- [ ] Both domains added & verified
- [ ] `cross-stitch.com` sitemap submitted

### Semrush
- [ ] `cross-stitch.com` project created
- [ ] Site Audit run at least once
- [ ] GA + GSC connected

---

## Notes (fill in)

- GA Measurement ID: `G-______________`
- Sitemap URL: `https://cross-stitch.com/______________`
- Semrush project name: `______________`
