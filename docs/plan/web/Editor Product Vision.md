# Editor — Product Vision & Status

Single source of truth for the cross-stitch editor product.
Replaces: `Editor_Analytics_and_Notifications.md`, `Editor_Analytics_Implementation_Plan.md`, `Feature_Request_System.md`, `Improve_First_Time_User_Experience.md`, `First_Time_UX_Implementation_Plan.md`.

---

## Primary Metric

**Editor opened → First successful image upload**

Everything else is secondary. If something delays or distracts from that first upload, it should be simplified, moved, or removed.

---

## Product Identity

This should not feel like a generic online converter.

Visitors should gradually discover that there is a real person behind this editor — someone who designs patterns, stitches patterns, and understands what it feels like to spend dozens of hours on a single project.

This identity should come through in small authentic moments across the page — not one large marketing block.

Target feeling:
> "This tool was built by someone who genuinely understands cross stitch."

---

## Product Personality

The editor should feel: professional, friendly, trustworthy, created by a member of the stitching community.

**Describe benefits, not features.** Replace technical descriptions with what the stitcher actually experiences:

| Instead of | Say |
|---|---|
| Palette reduction algorithm | Fewer unnecessary thread changes |
| Confetti removal | Patterns that are pleasant to stitch |
| AI color optimisation | Cleaner charts |
| Isolated stitch detection | Designed for real stitching sessions |

If the word "confetti" appears anywhere, briefly explain it — many visitors won't know what it means.

---

## Community

One long-term goal is to build the editor together with its users.

Near the feedback area, visitors should feel:
> Every important feature in this editor began with a real stitching problem.

Users should genuinely feel their feedback influences the product.

---

## What's Built

### ✅ First-Time Experience (2026-06-29)

**Goal:** Make the first action impossible to miss.

- **Hero section** (`HeroCta.tsx`) — prominent "Upload Your Photo" button + "Try a Sample Image" link above the editor. Dispatches `openImportFromPhoto` / `openSampleImage` custom events; `ConvertClient` listens.
- **Sample image** — `web/public/sample-photo.jpg` (puppy, 197 KB). On "Try a Sample Image": fetches the file, opens `ImportFromPhotoDialog` pre-loaded.
- **Feature cards** — compacted to smaller inline cards (no shadow, tighter padding). No longer dominate the page.
- **Empty canvas state** — hint text updated: "click Upload Your Photo above" instead of buried menu path.
- **Drag-and-drop** — already worked; now also tracks `image_drop_started` on first dragover.
- **Ads** — disabled on `/photo-to-cross-stitch` (both AdSense script and anchor ads).

### ✅ Analytics & Tracking (completed before 2026-06-29)

**GA4 events** (client-side, `ConvertClient.tsx`):

| Event | Fires when |
|---|---|
| `editor_landing_viewed` | Page mount |
| `editor_opened` | Page mount (with source + referrer) |
| `image_uploaded` | After import dialog confirms |
| `pattern_generated` | After conversion completes |
| `manual_editing_started` | First paint/fill action |
| `manual_editing_action` | Throttled (max 1 per 10s) |
| `palette_changed` | Color picker confirm |
| `pattern_size_changed` | Resize dialog confirm |
| `pdf_exported` | After PDF download completes |
| `project_saved` | After save API 200 |
| `project_reopened` | Editor loads existing pattern |
| `feedback_submitted` | Feature request POST 200 |
| `editor_error` | Catch blocks (convert / PDF / save) |
| `upload_cta_clicked` | Hero "Upload Your Photo" button |
| `sample_image_clicked` | Hero "Try a Sample Image" link |
| `image_drop_started` | First dragover on empty canvas |

**Server-side** (`EditorEvents` DDB table, 90-day TTL):
- Tracks subset: `editor_opened`, `pattern_generated`, `pdf_exported`, `feedback_submitted`, `editor_error`
- GSI on `date + eventType` for daily aggregation
- API route: `POST /api/analytics/editor-event`

**Milestone emails** (immediate, via SES):
- First editor visitor, first PDF export, first feedback — sent once each (flagged in DDB)
- Repeated errors (>5/day) — one alert email per day

**Daily Lambda summary** (step in pipeline):
- Counts by eventType, funnel conversion rates, feedback list, AI observations
- Skipped if zero events that day

**Admin page** `/admin/editor-analytics`:
- 30-day daily funnel table
- Recent errors, recent feedback, top sources
- Protected by `ADMIN_EMAILS`

### ✅ Feature Request System (completed before 2026-06-29)

- **"💡 I wish I could…" button** in editor header — amber button, opens dialog
- **Dialog** — textarea with `I wish I could...` placeholder + importance selector (Nice to have / Important / I really need this)
- **Success message** — "Thank you! Every suggestion is read by a real person."
- **Backend** — `POST /api/feature-requests` → `FeatureRequests` DDB table
- **Admin page** `/admin/feature-requests` — date, text, importance, status (new/reviewed/planned/done/rejected), context fields
- **Context fields** stored: patternWidth, patternHeight, colorsCount, editorTimeSeconds, userChangedStitchesCount, exportedPdf

### ✅ Entry Points from Other Pages (completed before 2026-06-29)

- **Design pages** — "Turn your own photo into a pattern" button → `/photo-to-cross-stitch?source=design_page&designId={id}` — tracks `design_editor_cta_clicked`
- **Album pages** — "Create your own cross-stitch pattern" CTA → `/photo-to-cross-stitch?source=album_page&albumId={id}` — tracks `album_editor_cta_clicked`

---

## What Remains

### Copy & Voice

The landing page currently uses generic SaaS copy. It should be rewritten to sound like a real stitcher speaking — authentic, benefit-focused, community-oriented.

Specific areas:
- Page description paragraph (currently: "Turn any photo or image into a custom cross-stitch pattern with DMC thread colors…")
- Feature card labels and descriptions
- Empty canvas state message
- Hero subtitle ("Upload a photo — I'll turn it into a cross-stitch pattern" is already good)
- "💡 I wish I could…" dialog — community framing near it
- Any mention of confetti, isolated stitches, or palette reduction → translate to stitcher language

### Landing Page Noise

The page below the editor is very long. Sections to review critically:
- FAQ (13 questions) — consider collapsing or trimming
- Tips section
- "What's in your PDF" section
- Fabric guide table
- "How to start stitching" guide (6 steps)

Some of this is good for SEO. Some delays the user's first upload. Evaluate each section: does it help a first-time visitor or only a returning one?

### Product Identity Moments

Small authentic messages still to place:
- Empty editor state — something warmer than a neutral placeholder
- Feature descriptions — rewrite from "Find any color instantly" to something that connects to real stitching experience
- Release notes or "what's new" area — not yet planned

---

## Future Ideas (not planned)

Analytics:
- Funnel charts and cohort analysis in admin page
- Retention analysis (returning users)
- Weekly digest email (currently daily only)
- AI grouping of similar feature requests

Feature requests:
- Public roadmap (show users what's planned)
- Voting on feature requests
- Email follow-up when a requested feature ships
