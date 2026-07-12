# How Claude Is Used on This Platform

There are two entirely separate uses of "Claude" in this project. Keeping them distinct matters because they have different purposes, different audiences, and different failure modes.

1. **Claude Code** — the CLI assistant Olga works with directly, as a development/operations partner.
2. **Claude API (Anthropic SDK)** — Claude models called *from inside the product itself*, generating content and analysis for end users and for Olga's own reporting.

---

## 1. Claude Code — Olga's development & operations assistant

**Why:** Olga runs the entire platform alone — web app, WPF Uploader, Pinterest automation, AWS infra, content/newsletters — with no team behind her. Claude Code acts as a force-multiplier across all of that: writing and reviewing code across three different stacks (Next.js/TypeScript, C#/WPF, AWS), running one-off investigations (ad-spend anomalies, bot traffic, IP review), keeping documentation in sync with a fast-moving codebase, and drafting recurring content (newsletters) in a consistent persona.

**How it's set up, concretely:**

- **`CLAUDE.md` files** at the repo root and in each sub-project (`docs/CLAUDE.md`, `web/CLAUDE.md`, `uploader/CLAUDE.md`) encode hard rules: never commit without being asked, never use Bash for file ops when a dedicated tool exists, don't invent AWS/DynamoDB/S3 conventions — treat the docs hub as source of truth.
- **`docs/Focus.md`** is the session anchor — read at the start of every session to pick up the current goal, what's in flight, and a "done when" checklist, so a session can pick up work exactly where the last one left off without Olga re-explaining context.
- **Skills** (slash commands) encode repeatable procedures so they run the same way every time instead of being re-derived from scratch: `/deploy-web` (build-then-`eb deploy`, because skipping the build step turns the EB environment Red), `/review-ip` (triage suspicious IPs flagged by the Pinterest-agent's bot detector).
- **A persistent memory system** (outside this repo, at `~/.claude/projects/.../memory/`) tracks cross-session facts that aren't derivable from the code itself: standing feedback ("always ask before sending mass email," "use formal Russian address"), in-flight project state (milestone status, pending decisions), and reference pointers (where the milestones doc lives, the Amazon Associates ID). This is what lets a new session behave consistently with prior ones without Olga repeating herself.
- **Throwaway investigation scripts** — the many one-off `automation/pinterest-agent/scripts/_check_*.ts` files are a recurring pattern: when Olga asks "is this anomaly real," Claude Code writes a small script against the existing DynamoDB/GA4 data to check it, rather than guessing from memory.
- **Guardrails Olga has set deliberately:** Claude Code does not send mass emails without an explicit per-send go-ahead; in the separate Rafael interview-prep folder, Claude gives instructions but doesn't type the code itself, so the practice value isn't lost.

**Who's "talking":** Claude Code only acts on explicit requests in a session — it doesn't have standing access to send email, deploy, or push code on its own initiative; those remain manual, confirmed actions.

---

## 2. Claude API — in-product AI features (Anthropic SDK, `@anthropic-ai/sdk` / raw HTTPS)

**Why:** Several parts of the platform need to generate natural-language content or analyze data at a scale that isn't practical by hand for one operator — writing SEO copy and Pinterest captions for ~5,500+ designs, or reading through daily Pinterest/GA4/AdSense numbers for a trend that matters. Claude models do that generation/analysis work as a backend dependency of the product, invisibly to the end user (except for the AI search feature, which is user-facing).

**How — by call site, cheapest/fastest model where the task allows it:**

| Call site | Model | Purpose |
|---|---|---|
| `uploader/Uploader/Helpers/SeoTextGenerator.cs` | `claude-haiku-4-5` | Generates the SEO description text for a design page at upload time (~$0.001/call — cheap enough to run on every design). |
| `uploader/Uploader/Helpers/PinSuggestionsGenerator.cs` | `claude-sonnet-4-6` | Generates Pinterest pin title/description suggestions — needs more reasoning quality than the SEO blurb, so it uses the stronger model. |
| `web/src/app/api/ai-search` | `claude-opus-4-8` | Powers the site's natural-language design search — user-facing, so it gets the highest-quality model. |
| `web/src/app/api/image-search` | `claude-haiku-4-5` | Assists image-based search — high volume, latency-sensitive. |
| `automation/pinterest-agent/src/services/editorDailySummary.ts` | `claude-haiku-4-5` | Drafts the daily editor-facing summary email. |
| `automation/pinterest-agent/scripts/test-ai-trend-analysis.ts`, `test-ai-design-analysis.ts` | `claude-sonnet-4-6` | Analyzes Pinterest/GA4/AdSense trend and per-design data as part of the daily Lambda pipeline, producing the recommendations Olga acts on for ad spend and content decisions. |

**Model choice logic, in short:** Haiku for high-volume, low-stakes text generation (SEO blurbs, quick summaries); Sonnet where actual reasoning over data is required (trend/design analysis, pin suggestions); Opus only where a user is directly reading the output and quality matters most (site search).

**Credentials:** `ANTHROPIC_API_KEY` is set per-environment — local `.env` for scripts, Lambda environment variables for the daily pipeline, and passed into the Uploader's HTTP client from its own config. It is never checked into git.

---

## Quick distinction

| | Claude Code | Claude API (Anthropic SDK) |
|---|---|---|
| Who is the user | Olga | End users / Olga's own reporting pipeline |
| Runs where | Olga's terminal, interactively | Uploader (C#), web app routes, Lambda pipeline |
| Triggered by | Olga's messages in a session | Code paths — design upload, a search request, the daily cron |
| Controlled by | `CLAUDE.md`, `Focus.md`, skills, memory | Model choice + prompt in each call site |
