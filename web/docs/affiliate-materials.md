# Affiliate Materials Feature

## Overview

A compact "Everything you need to start" section appears on individual design pages, recommending basic embroidery supplies with links to configured affiliate stores.

The section is hidden entirely when no affiliate URLs are configured, so it is safe to deploy without any setup.

---

## Where it appears

The affiliate block is rendered on every individual design page (`/designs/[designId]`), after the bottom AdSense ad slot and before the second download button.

---

## How to configure

Add the following to `.env.local` (copy from `.env.local.example`):

```env
NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_URL=https://www.lovecrafts.com/en-gb/l/needle-crafts/cross-stitch?utm_source=yoursite&utm_medium=affiliate&...
NEXT_PUBLIC_AMAZON_AFFILIATE_URL=https://www.amazon.com/s?k=cross+stitch+supplies&tag=YOUR-ASSOCIATES-TAG-20
```

- Fill in your own affiliate tracking URLs obtained from each programme.
- Each URL should include the programme's required tracking parameter (e.g. Amazon Associates `tag=`, LoveCrafts referral parameter).
- Never hardcode real affiliate IDs in source code.
- Leave a variable blank or omit it to hide that store's links completely.

---

## How to disable the feature

Leave both variables unset (or blank). The `AffiliateMaterials` component returns `null` and nothing is rendered.

---

## Obtaining real affiliate IDs

- **LoveCrafts:** apply at the LoveCrafts affiliate programme (Awin network).
- **Amazon:** apply at Amazon Associates (`affiliate-program.amazon.com`).

Real IDs must be obtained separately. Placeholder values in the example file are not valid.

---

## GA4 analytics event

**Event name:** `affiliate_material_click`

**Parameters:**

| Parameter | Value |
|---|---|
| `store` | `lovecrafts` or `amazon` |
| `item_category` | `floss`, `fabric`, `needles`, `hoop`, `organizer` |
| `design_id` | numeric design ID |
| `design_name` | design caption / title |
| `page_path` | current page URL path |
| `link_url` | the affiliate URL that was clicked |

The event fires on click of each individual item-level store link using the site's existing `window.gtag` integration. It is safe when `gtag` is unavailable or during SSR.

---

## Architecture

| File | Role |
|---|---|
| `src/lib/affiliate-config.ts` | Reads `NEXT_PUBLIC_*` env vars; returns typed config |
| `src/app/components/AffiliateMaterials.tsx` | Client component; renders the section; fires GA4 events |
| `src/lib/affiliate-config.test.ts` | Vitest unit tests for config logic |
| `web/.env.local.example` | Documented environment variable template |

The design page (`src/app/designs/[designId]/page.tsx`) reads the config server-side and passes it as props to `AffiliateMaterials`. The component returns `null` if no stores are configured.

---

## Link attributes

All affiliate links use:

```html
target="_blank"
rel="sponsored nofollow noopener noreferrer"
```

They open in a new tab, are keyboard accessible, and carry screen-reader text "(opens in new tab)".
