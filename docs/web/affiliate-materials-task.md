# Affiliate Materials Feature for Cross-Stitch.com

## Goal

The website is:

- `cross-stitch.com`
- built with Next.js and Node.js
- contains several thousand free cross-stitch pattern pages

The goal is to earn affiliate commissions by recommending the exact materials required for each pattern.

This first version must remain focused:

- do not build a full shop;
- add a compact pattern-specific materials section to individual design pages.

The main value to the user is:

> Buy the exact colors and quantities required for this pattern.

---

## Git workflow

Already set up: branch `worktree-affiliate-materials`, worktree `.claude/worktrees/affiliate-materials`.

1. Inspect the repository and current Git status.
2. Do not modify, remove, stash, or overwrite any existing uncommitted work.
3. Perform all implementation work only inside this worktree.
4. Do not merge or deploy the changes.
5. After validating the implementation, create one clean commit on the branch.

---

## Feature requirements

Add a compact pattern-specific materials section to individual cross-stitch design pages.

### Title

`Materials for this pattern`

### Description

`Buy the exact colors and quantities required to stitch this design.`

### Content

Display the exact requirements for the current pattern, including:

- thread brand, color code, color name, and quantity (skeins);
- fabric type, count, color, and required dimensions;
- needle type and size, when specified;
- hoop or frame size, when relevant.

Show only stores that have a configured and valid product mapping for each material.

### Example display

| Material | Required | Shop |
|---|---:|---|
| DMC 310 Black | 2 skeins | Amazon / LoveCrafts |
| DMC 321 Red | 1 skein | Amazon / LoveCrafts |
| White Aida 14 ct | 32 × 38 cm | Amazon / LoveCrafts |
| Tapestry needle No. 24 | 1 | Amazon / LoveCrafts |
| 25 cm hoop | 1 | Amazon / LoveCrafts |

The exact presentation may use a table, grouped list, compact cards, or another accessible structure that matches the current site.

If a design has no materials data, the section must not appear.

---

## Data model

Clearly separate:

1. materials required by a specific pattern;
2. store-specific product mappings (shared catalog);
3. affiliate account configuration (environment variables only).

Do not duplicate the same store URL or product identifier inside thousands of pattern records when a shared catalog can be used instead.

### Pattern material requirements

Store per-pattern material data in a format appropriate for the existing architecture.
Inspect the existing design data model and choose a clean, maintainable structure.

A reference structure:

```json
{
  "materials": {
    "floss": [
      { "brand": "DMC", "code": "310", "name": "Black", "skeins": 2 },
      { "brand": "DMC", "code": "321", "name": "Red",   "skeins": 1 }
    ],
    "fabric": {
      "type": "Aida",
      "count": 14,
      "color": "White",
      "requiredWidthCm": 32,
      "requiredHeightCm": 38
    },
    "needle": { "type": "Tapestry", "size": 24, "quantity": 1 },
    "hoop":   { "recommendedDiameterCm": 25, "quantity": 1 }
  }
}
```

Optional fields: `strands`, `metersRequired`, `notes`, `unit`, `safetyAllowance`.

Buyer-facing quantities must be clear: `2 skeins`, `32 × 38 cm`, `1 hoop`.

Fabric, needle, and hoop data are optional; the component must handle their absence gracefully.

### Shared product catalog

Map normalized material identifiers to store-specific products.

```json
{
  "materialKey": "dmc:310",
  "brand": "DMC",
  "code": "310",
  "stores": {
    "amazon":     { "productId": "STORE_PRODUCT_ID", "url": "STORE_PRODUCT_URL" },
    "lovecrafts": { "productId": "STORE_PRODUCT_ID", "url": "STORE_PRODUCT_URL" }
  }
}
```

Do not put real affiliate identifiers into committed source files.

Affiliate URLs should be constructed by appending the affiliate account identifier to a base product URL at render or configuration time — not by storing pre-assembled affiliate URLs in the product catalog or in pattern records.

---

## Affiliate configuration

Use environment variables or the repository's existing configuration mechanism.

Add clearly named example variables to the appropriate example environment file.

Suggested names:

```env
NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG=
NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_ID=
```

You may improve these names if the repository already uses a better convention.

Requirements:

- Never put affiliate account identifiers into source code or data files.
- Gracefully hide a store link when its identifier is not configured.
- If no affiliate identifiers are configured, either hide the complete affiliate block or show a harmless development-only state.
- Choose the approach that best matches the existing project conventions.

---

## Affiliate disclosure

Display a small, readable disclosure inside or immediately below the affiliate section:

> This page contains affiliate links. We may earn a small commission at no additional cost to you.

---

## Store links and product matching

Support exact product links where product mappings exist.

For each material:

- show only stores with a configured and valid product mapping;
- do not invent product URLs;
- do not silently substitute an unrelated item;
- do not claim an exact match if only a generic search page is available.

When an exact product link is unavailable, choose a safe fallback:

- hide that store for the material;
- provide a clearly labelled store search link;
- or show the material without a purchase link.

The UI must distinguish an exact product link from a general store search link.

Acceptable labels:

- `Buy DMC 310 on LoveCrafts`
- `Buy DMC 310 on Amazon`
- `Search Amazon for DMC 310`

Do not use misleading labels such as `Best price`, `Official store`, or `Guaranteed match`.

---

## Buying multiple materials

Design the architecture so that a future feature can support a "Buy all materials" or "Add all to basket" action.

For the initial implementation:

- individual exact product links per material are acceptable;
- a "buy all" action may be omitted if it cannot be implemented reliably.

Do not simulate a multi-product cart using unsupported or fragile behavior.
Do not claim "Buy all" is available unless the selected store actually supports it through its documented affiliate mechanisms.

---

## Link requirements

Affiliate links must:

- open in a new tab;
- use appropriate `rel` attributes:
  - `sponsored`
  - `nofollow`
  - `noopener`
  - `noreferrer`
- be keyboard accessible;
- have meaningful link text;
- not depend only on surrounding visual context.

Do not:

- make the whole large block clickable;
- use cloaked redirects.

---

## Analytics

Track affiliate-link clicks through the site's existing analytics integration.

Use this GA4 custom event:

```text
affiliate_material_click
```

Include useful parameters where the data is available:

- `store`
- `design_id`
- `design_name`
- `page_path`
- `material_type`
- `material_brand`
- `material_code`
- `material_name`
- `quantity`
- `quantity_unit`
- `product_id`
- `link_type`
- `link_url`

Suggested `material_type` values:

- `floss`
- `fabric`
- `needle`
- `hoop`
- `frame`
- `organizer`
- `general_supply`

Suggested `link_type` values:

- `exact_product`
- `store_search`
- `general_store`

Requirements:

- Do not send unavailable values merely to fill every field.
- Do not include sensitive user data.
- Do not add a second GA4 initialization if analytics is already initialized.
- Reuse the existing analytics helper or `gtag` integration.
- Analytics must not break navigation when `gtag` is unavailable.
- Analytics must not throw during server-side rendering.
- Do not access `window` without an appropriate client-side guard.
- Follow the repository's existing analytics conventions.

---

## UI and placement

Find the component responsible for individual design pages.

Place the materials section where it is useful but not intrusive, preferably:

- near the pattern-download area; or
- after the primary design information.

Do not place it above the main design content.

Requirements:

- Keep it visually smaller than the primary download action.
- Match existing typography, spacing, colors, buttons, and component conventions.
- Make it responsive on mobile and desktop.
- Avoid creating a large product grid.
- Avoid making the page look overloaded with advertising.
- Preserve existing AdSense components and layout.
- If a design has no materials data, the section must not appear.

---

## Architecture

Implement the affiliate section as a reusable component.

Keep:

- pattern material requirements (data);
- shared product catalog (data);
- affiliate configuration (environment variables);
- analytics logic;
- presentation

reasonably separated.

Requirements:

- Avoid unnecessary dependencies.
- Do not introduce a state-management library.
- Reuse existing button, card, layout, and analytics helpers when suitable.
- Do not duplicate existing components.
- Preserve the current rendering model unless a client component is genuinely needed.
- Keep as much of the design page server-rendered as possible.

---

## SEO and performance

Do not:

- add affiliate URLs to structured data unless there is an existing valid reason;
- make affiliate links part of canonical URL logic;
- add affiliate links to the sitemap;
- load product images in this first version;
- add heavy scripts;
- negatively affect LCP.

Preserve the site's current SEO behavior.

---

## Testing and validation

Inspect the existing package scripts and testing conventions.

Add appropriate tests if the repository already has a test setup.

Validate:

1. The component is hidden or behaves safely when no affiliate URLs are configured.
2. Only configured stores are displayed.
3. Affiliate-link attributes are correct.
4. Analytics is called with the expected event name and parameters.
5. Analytics absence does not cause an error.
6. Exact pattern material quantities are rendered correctly.
7. Multiple thread colors are rendered without duplication.
8. Only stores with a matching product mapping are shown per material.
9. Missing product mappings do not break the page.
10. Exact product links and store-search fallbacks are labelled differently.
11. Analytics receives material-specific parameters (`material_brand`, `material_code`, `link_type`, etc.).
12. Affiliate account configuration is not embedded in pattern records.
13. The design page remains valid when optional fabric, needle, or hoop data is missing.
14. The component remains usable with a long list of thread colors.
15. No unconfigured "Buy all materials" action is shown.

Run the relevant existing commands, such as:

- type checking;
- linting;
- tests;
- production build.

Fix problems caused by the implementation.

Do not:

- make unrelated repository-wide formatting changes;
- upgrade dependencies unless strictly necessary.

---

## Documentation

Update the relevant README or create a short focused document explaining:

- the chosen material data structure;
- how to add or update materials for a pattern;
- how to map a normalized material to Amazon or LoveCrafts products;
- how affiliate account configuration is applied;
- what happens when a store mapping is missing;
- the difference between exact-product and store-search links;
- the GA4 event name and material-specific parameters;
- how to configure the affiliate identifiers;
- where the affiliate block appears;
- how to disable the feature;
- whether "Buy all materials" is supported or intentionally deferred;
- that real affiliate IDs must be obtained separately from the affiliate networks.

Include a small example showing one pattern with at least two thread colors and one fabric requirement.

---

## Repository inspection before implementation

Before changing code, briefly inspect the repository and identify:

- the individual design-page route;
- the existing design data model (DynamoDB schema, TypeScript types);
- the existing analytics implementation;
- existing UI component conventions;
- the correct environment-configuration approach.

Then proceed without asking routine implementation questions.

Make reasonable decisions based on the repository.

---

## Final response requirements

When the work is complete, report:

1. Worktree path
2. Branch name
3. Concise explanation of the implementation
4. Important files changed
5. Environment variables that must be configured
6. Analytics event and parameters added
7. Commands run and whether they passed
8. Limitations or decisions that should be reviewed
9. Commit hash

Do not deploy, merge, or modify the original working tree.
