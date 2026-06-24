# Clarifications for `affiliate-materials-task.md`

## Purpose of this file

This file contains required corrections and additions to the earlier task document:

`affiliate-materials-task.md`

Do not treat this as a separate implementation task.

First update the original task document so that it fully incorporates these clarifications. Then use the updated original document as the single source of truth for implementation.

---

## Major correction

The earlier document incorrectly limited the first version to a universal materials block and said:

> do not create pattern-specific thread lists yet

Remove that restriction.

The site owner always knows, or can store, the exact materials required for every pattern, including:

- thread brand;
- thread color code;
- thread color name, when available;
- exact quantity of thread;
- fabric type;
- fabric count;
- fabric color;
- required fabric dimensions;
- appropriate needle type and size;
- recommended hoop or frame size, when relevant.

The implementation should therefore be designed around exact, pattern-specific material requirements from the beginning.

The feature must not be limited to generic links such as "Buy embroidery supplies."

Its main value should be:

> Buy the exact colors and quantities required for this pattern.

---

## Data format

The site owner can store the material data in whatever format is technically appropriate.

Do not assume that the current repository already contains the final data structure.

Inspect the existing design data model and choose a clean, maintainable format that fits the current architecture.

The implementation should clearly separate:

1. materials required by a specific pattern;
2. store-specific product mappings;
3. affiliate account configuration.

Do not duplicate the same store URL or product identifier inside thousands of pattern records when a shared catalog or mapping can be used instead.

A possible conceptual structure is shown below, but it is not mandatory if the existing repository suggests a better design.

### Pattern material requirements

```json
{
  "materials": {
    "floss": [
      {
        "brand": "DMC",
        "code": "310",
        "name": "Black",
        "skeins": 2
      },
      {
        "brand": "DMC",
        "code": "321",
        "name": "Red",
        "skeins": 1
      }
    ],
    "fabric": {
      "type": "Aida",
      "count": 14,
      "color": "White",
      "requiredWidthCm": 32,
      "requiredHeightCm": 38
    },
    "needle": {
      "type": "Tapestry",
      "size": 24,
      "quantity": 1
    },
    "hoop": {
      "recommendedDiameterCm": 25,
      "quantity": 1
    }
  }
}
```

Optional fields may include:

- stitch count;
- number of strands;
- meters required;
- calculation source;
- safety allowance;
- unit of measurement;
- notes.

The buyer-facing quantity should remain clear, for example:

- `2 skeins`;
- `1 pack`;
- `32 × 38 cm`;
- `1 hoop`.

### Shared product mapping

A shared catalog may map a normalized material to products sold by supported stores.

Example:

```json
{
  "materialKey": "dmc:310",
  "brand": "DMC",
  "code": "310",
  "stores": {
    "amazon": {
      "productId": "STORE_PRODUCT_ID",
      "url": "STORE_PRODUCT_URL"
    },
    "lovecrafts": {
      "productId": "STORE_PRODUCT_ID",
      "url": "STORE_PRODUCT_URL"
    }
  }
}
```

Do not put real affiliate identifiers into committed source files.

---

## Pattern-specific UI

Replace the generic-only recommendation concept with a reusable pattern-specific materials component.

Suggested heading:

`Materials for this pattern`

Suggested description:

`Buy the exact colors and quantities required to stitch this design.`

The component should display the exact requirements for the current pattern.

Example:

| Material | Required | Shop |
|---|---:|---|
| DMC 310 Black | 2 skeins | Amazon / LoveCrafts |
| DMC 321 Red | 1 skein | Amazon / LoveCrafts |
| White Aida 14 ct | 32 × 38 cm | Amazon / LoveCrafts |
| Tapestry needle No. 24 | 1 | Amazon / LoveCrafts |
| 25 cm hoop | 1 | Amazon / LoveCrafts |

The exact presentation may use a table, grouped list, compact cards, or another accessible structure that matches the current site.

Requirements:

- Show the exact thread color and quantity.
- Show fabric specifications and required dimensions.
- Show needle and hoop recommendations when available.
- Keep the section compact and readable.
- Make it responsive on mobile and desktop.
- Do not turn it into a large product grid.
- Keep it visually secondary to the primary pattern download action.
- Preserve the existing AdSense layout.

---

## Store links and product matching

Support exact product links where product mappings exist.

For each material:

- show only stores with a configured and valid product mapping;
- do not invent product URLs;
- do not silently substitute an unrelated item;
- do not claim an exact match if only a generic search page is available.

When an exact product link is unavailable, choose a safe fallback based on the repository and store capabilities, such as:

- hide that store for the material;
- provide a clearly labelled store search link;
- show the material without a purchase link.

The UI must distinguish an exact product link from a general store search link.

Possible labels:

- `Buy DMC 310 on LoveCrafts`
- `Buy DMC 310 on Amazon`
- `Search Amazon for DMC 310`

Do not use misleading labels such as:

- `Best price`
- `Official store`
- `Guaranteed match`

---

## Buying multiple materials

Design the architecture so that a future feature can support:

`Buy all materials`

or:

`Add all available materials to basket`

Do not claim that this works unless the selected store actually supports creating a multi-item cart or basket through its documented affiliate mechanisms.

For the initial implementation:

- individual exact product links are acceptable;
- a grouped store section is acceptable;
- a "buy all" action may be omitted if it cannot be implemented reliably.

Do not simulate a multi-product cart using unsupported or fragile behavior.

---

## Affiliate configuration

Affiliate account identifiers must remain separate from pattern and product data.

Use environment variables or the repository's existing secure configuration convention.

Possible variables include:

```env
NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG=
NEXT_PUBLIC_LOVECRAFTS_AFFILIATE_ID=
```

Use different names if the existing repository has a better convention.

Store product identifiers and ordinary destination URLs are not necessarily secrets, but affiliate account identifiers must not be duplicated throughout the data model.

Review whether affiliate URLs should be generated:

- from a base product URL plus affiliate identifier;
- from a pre-generated deep link;
- through an existing affiliate-network mechanism.

Choose the safest maintainable approach supported by the actual affiliate program.

---

## Analytics changes

Retain the GA4 event:

```text
affiliate_material_click
```

Expand the event parameters where the data is available.

Recommended parameters:

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

Do not send unavailable values merely to fill every field.

Do not include sensitive user data.

Continue to follow all original requirements concerning:

- existing GA4 initialization;
- server-side rendering safety;
- `window` guards;
- navigation safety;
- unavailable `gtag`;
- reuse of current analytics helpers.

---

## Testing additions

In addition to the tests requested in the original document, validate:

1. Exact pattern material quantities are rendered correctly.
2. Multiple thread colors are rendered without duplication.
3. Only stores with a matching product mapping are shown.
4. Missing product mappings do not break the page.
5. Exact product links and store-search fallbacks are labelled differently.
6. Analytics receives material-specific parameters.
7. Affiliate account configuration is not embedded in pattern records.
8. The design page remains valid when optional fabric, needle, or hoop data is missing.
9. The component remains usable with a long list of thread colors.
10. No unconfigured "Buy all" action is shown.

---

## Documentation additions

Update the documentation to explain:

- the chosen material data structure;
- how to add or update materials for a pattern;
- how to map a normalized material to Amazon or LoveCrafts;
- how affiliate account configuration is applied;
- what happens when a store mapping is missing;
- the difference between exact-product and store-search links;
- the GA4 event and material-specific parameters;
- whether "Buy all materials" is supported or intentionally deferred.

Include a small example showing one pattern with at least two thread colors and one fabric requirement.

---

## Required update to the original task document

Before implementation:

1. Read `affiliate-materials-task.md`.
2. Read this clarification file.
3. Edit `affiliate-materials-task.md` so it incorporates all of these corrections.
4. Remove contradictions, especially the universal-only first-version limitation.
5. Keep the original Git worktree, safety, SEO, performance, accessibility, validation, and final-report requirements.
6. Present a concise summary of the changes made to the task document.
7. Then implement the feature according to the updated task document.

The updated `affiliate-materials-task.md` must become the single authoritative implementation specification.

Do not implement from two conflicting documents.
