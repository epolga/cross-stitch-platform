# Editor Analytics and Owner Notifications

## Context

The cross-stitch editor is now public.

Before promoting it widely, I want to understand how real visitors use it.

Please implement a lightweight analytics and owner-notification system.

This document describes product goals and requirements, not a strict implementation plan.  
You know the project architecture better than this document does, so please use your judgment and integrate the solution in the cleanest, most maintainable way for this codebase.

---

## Main Goals

I want to answer questions such as:

- How many people opened the editor?
- How many came from design pages?
- How many uploaded an image?
- How many generated a pattern?
- How many manually edited the pattern?
- How many exported a PDF?
- How many submitted feedback?
- Where do users abandon the workflow?
- Which features are actually used?
- Are people returning later?

The goal is product insight, not just raw logging.

---

## Add Entry Points from Design Pages and Album Pages

I realized that users who land on individual design pages or album/category pages may not know that the editor exists.

Please add visible but tasteful calls-to-action in both places:

1. Individual design pages
2. Album/category pages

### Design page CTA

Suggested labels:

- **Edit this pattern**
- **Customize this pattern**
- **Open in editor**

Preferred behavior:

- If the design can be opened directly in the editor, open it.
- If not, route the user to the editor with the design context if possible.
- Track this click as an analytics event.

Suggested event:

```ts
design_editor_cta_clicked
```

Useful metadata:

```ts
{
  designId,
  designTitle,
  pageUrl,
  source: "design_page"
}
```

### Album/category page CTA

On album/category pages, add a CTA that introduces the editor as a general tool, not tied to one specific design.

Suggested labels:

- **Create your own cross stitch pattern**
- **Turn your image into a cross stitch pattern**
- **Open the cross stitch editor**

Preferred behavior:

- Route the user to the editor.
- If the album/category context is useful, pass it as context or metadata.
- Track this click separately from design-page clicks.

Suggested event:

```ts
album_editor_cta_clicked
```

Useful metadata:

```ts
{
  albumId,
  albumTitle,
  categorySlug,
  pageUrl,
  source: "album_page"
}
```

The goal is to understand which entry point works better:
- direct design customization;
- or general editor discovery from album/category pages.

---

## Editor Event Tracking

Please track meaningful editor events.

Suggested events:

```ts
editor_opened
design_editor_cta_clicked
image_uploaded
pattern_generation_started
pattern_generated
manual_editing_started
manual_editing_action
palette_changed
pattern_size_changed
pdf_exported
project_saved
project_reopened
feedback_submitted
editor_error
```

You do not have to use these exact names if the project already has a naming convention.

Please add any additional events that would be useful.

---

## Funnel Metrics

The most important funnel is:

```text
Design page / Editor page
        ↓
Editor opened
        ↓
Image uploaded or design loaded
        ↓
Pattern generated
        ↓
Manual edit
        ↓
PDF exported
        ↓
Feedback submitted / return visit
```

Please make it possible to calculate conversion between these steps.

---

## Session Tracking

Track editor sessions when possible.

Useful fields:

- sessionId
- userId if logged in
- anonymous visitor/session identifier if available
- startedAt
- endedAt
- durationSeconds
- sourcePage
- designId
- projectId
- uploadedImageUsed
- generatedPattern
- exportedPdf
- feedbackSubmitted
- numberOfEditingActions

If the current architecture already has a better session concept, use it.

---

## Event Context

Whenever possible, attach useful context to editor events:

- designId
- projectId
- pageUrl
- referrer
- traffic source if available
- pattern width
- pattern height
- colors count
- editor time
- whether PDF was exported
- browser language
- user agent

Do not over-engineer this. Store what is easy and useful.

---

## Email Notifications

I want emails, but not spam.

### Immediate Notifications

Send immediate emails only for important events.

Suggested immediate notifications:

- first editor usage after deployment
- first PDF export
- first feedback submission
- repeated editor errors
- repeated pattern generation failures
- anything that looks critical

Please avoid sending an email for every normal event.

---

## Daily Owner Summary Email

Create one daily email summary for me.

This should not be a raw dump of numbers.

The email should include both numbers and short observations.

Example structure:

```text
Subject: Editor Daily Summary - 2026-06-28

Today:
- Editor opened: 42
- Design page CTA clicks: 18
- Images uploaded: 27
- Patterns generated: 22
- PDFs exported: 9
- Feedback messages: 3
- Errors: 1

Funnel:
- 64% of users who uploaded an image generated a pattern.
- 41% of generated patterns were exported as PDF.

Observations:
- Most users who reached pattern generation continued to PDF export.
- Several users opened the editor from cat pattern pages.
- One user requested Anchor thread support.
- There was one repeated error in PDF export.

Suggested next action:
- Check whether the editor CTA is visible enough on design pages.
```

The key point: please highlight anything interesting.

Examples of useful observations:

- “PDF exports increased compared to yesterday.”
- “Many users opened the editor but did not upload an image.”
- “Users from design pages convert better than users from the standalone editor page.”
- “Three feedback requests mention the same feature.”
- “Most errors happen after pattern generation.”
- “The editor CTA on design pages is being clicked.”

If implementing comparisons to yesterday/week is too much for the first version, keep it simple and leave the structure ready for later improvement.

---

## Email Infrastructure

Use the existing email infrastructure if the project already has one.

Do not add unnecessary external services.

If there is no suitable email infrastructure, implement the simplest maintainable solution and document the required environment variables.

---

## Suggested Admin / Internal View

If it is easy to add, create a simple internal analytics page:

```text
/admin/editor-analytics
```

This is not required to be beautiful.

Useful sections:

- daily event counts
- funnel summary
- recent feedback
- recent errors
- top design pages that sent users to the editor

Protect it using the existing admin mechanism.

If this is too much for this iteration, prioritize event tracking and daily email.

---

## Relationship to Feature Requests

If a feature request system already exists or is being added, integrate with it.

When a user submits feedback from the editor, the daily summary should mention:

- number of feedback messages
- most important requests
- repeated themes

---

## Privacy

Do not collect unnecessary personal data.

Email is optional.

If the user is logged in, attach userId/email where appropriate.

Anonymous usage should still be tracked.

---

## Future Extensions

Please keep the code ready for future additions:

- admin analytics dashboard
- funnel charts
- cohort analysis
- retention analysis
- AI-generated summaries
- grouping similar feature requests
- weekly reports
- anomaly detection

Do not implement all of these now.

---

## Implementation Philosophy

Please feel free to improve this plan if you see a simpler, cleaner, more maintainable, or more idiomatic solution.

You already know the project structure better than this document.

The objective is to help me understand whether users are discovering the editor, using it successfully, and where the product needs improvement.

Please explain any important implementation decisions in your final notes.
