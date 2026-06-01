# Repo summary (for Codex)

## What this is
- Next.js app-router SSR site for cross-stitch patterns, deployed on AWS Elastic Beanstalk.
- React 19, Next 15, Node 20, Tailwind CSS.

## Core data + storage
- DynamoDB is the primary store for designs, albums, and users.
- `src/lib/data-access.ts` caches designs/albums in memory and exposes read APIs plus download count updates.
- `src/lib/users.ts` manages users in the secondary users table (registration, verification, unsubscribe, update last email).
- CloudFront hosts images and PDFs; URLs are built in `src/lib/data-access.ts` and `src/lib/url-helper.ts`.

## Key API routes (app router)
- Designs/albums:
  - `src/app/api/designs/route.ts` (list)
  - `src/app/api/designs/[designId]/route.ts` (get + increment download count)
  - `src/app/api/albums/[albumId]/route.ts` (list by album)
- Auth + registration:
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/login-from-email/route.ts`
  - `src/app/api/auth/request-password-reset/route.ts`
  - `src/app/api/auth/reset-password/route.ts`
  - `src/app/api/register-only/route.ts`
  - `src/app/api/register-only/verify/route.ts`
- Subscriptions/PayPal:
  - `src/app/api/subscription/plan/route.ts`
  - `src/app/api/subscription/confirm/route.ts`
  - `src/app/api/paypal-webhook/route.js`
- Utilities:
  - `src/app/api/missing-design-pdfs/route.ts` (serves `MissingDesignPdfs.txt`)
  - `src/app/api/sitemap.xml/route.ts` (builds + caches sitemap in S3)
  - `src/app/api/image/route.ts` (proxy image by slug)
  - `src/app/api/notify-admin/route.ts`
  - `src/app/api/log-client-error/route.ts`
  - `src/app/api/health/route.ts`

## Frontend entrypoints
- Home search + catalog: `src/app/page.tsx`
- Album index: `src/app/albums/page.tsx`
- Album page: `src/app/albums/[albumId]/page.tsx`
- Design page: `src/app/designs/[designId]/page.tsx`
- Navigation + auth UI: `src/app/components/ClientNav.tsx`, `src/app/components/AuthControl.tsx`

## Download gating
- Download behavior is controlled by `NEXT_PUBLIC_DOWNLOAD_MODE` (free, register, paid).
- Missing PDF list `MissingDesignPdfs.txt` is used to decide whether to serve legacy or new per-format PDFs.
- Download UI and gating:
  - `src/app/components/DownloadPdfLink.tsx`
  - `src/app/components/DesignList.tsx`
  - `src/app/designs/[designId]/DesignDownloadControls.tsx`

## Email + notifications
- SES via AWS SDK v3 in `src/lib/email-service.ts` and `src/lib/password-reset-email.ts`.
- Admin notifications are sent for registration events, PayPal webhook events, and client errors.

## Error handling + security
- Server-side error handler in `src/lib/global-error-handler.ts` (optional source maps, throttled email).
- Request URL tracking and HSTS in `src/middleware.ts`.

## Environment variables (common)
- AWS: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- DynamoDB: `DYNAMODB_TABLE_NAME`, `DDB_USERS_TABLE`, `DDB_RESET_TOKENS_TABLE`, `DDB_SUBSCRIPTION_EVENTS_TABLE`
- SES: `AWS_SES_FROM_EMAIL` (or `SES_FROM_EMAIL`), `ADMIN_EMAIL`
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_API_URL`
- S3: `S3_BUCKET_NAME`
- Site URL: `NEXT_PUBLIC_SITE_URL`

## Notes
- Many routes force SSR with `export const dynamic = "force-dynamic"`.
- Design and album metadata fetches use local API endpoints for SEO.
