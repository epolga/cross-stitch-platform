# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository nature

This is the **docs and planning hub** inside the `cross-stitch-platform` monorepo. The monorepo root contains:

- `../web/` — the cross-stitch Next.js web application
- `../uploader/` — the WPF uploader application
- `../automation/` — AutoPinner and Pinterest agent cron scripts
- `../shared/` — shared C# library

The VS Code workspace at `cross-stitch.code-workspace` opens all folders together so the docs and all codebases can be edited side-by-side.

There are no build, lint, test, or run commands in this folder. Work here is editing Markdown, text, spreadsheets, and PDFs.

## The plan/ vs docs/ split (load-bearing)

The most recent restructuring commit enforces a strict separation between two top-level directories. New files must go in the correct one:

- **`plan/`** — planning, roadmap, milestone, and operational-strategy documents **only**. Anything that describes _what we intend to do_ or _when_.
- **`docs/`** — everything else: templates, helper notes, reference material, automation scripts, build-output documentation. Anything that describes _how things work_ or _what exists_.

Both directories use a parallel subfolder structure organized by topic/component (`cross-stitch/`, `uploader/`, `automation/`, plus topical folders under `plan/` like `aws/`, `etsy/`, `paypal/`, `integration-*/`, etc.). When adding a new document, choose the subfolder by topic and the top-level directory by plan-vs-operational. Do not put non-planning files under `plan/` — the previous restructure existed specifically to clean that up.

## Cross-project context

Documents under `plan/cross-stitch/` and `docs/web/` describe the cross-stitch web app that lives at `../web/`. Documents under `plan/uploader/` and `docs/uploader/` describe the WPF app at `../uploader/`. Files like the Pinterest AI Agent series under `plan/cross-stitch/` span both projects (WPF integration is documented there).

When a planning doc references a file path, treat unprefixed paths as relative to the relevant sibling project, not this repo.

## Focus.md size management

`Focus.md` (session-start guide, read at the start of every session) should
stay lean — it's re-read in full every session, so completed-work narrative
left sitting in it dilutes the signal (current goal, active work, genuinely
open items). When reading it at session start, check its size: **if it
exceeds ~600 lines, proactively propose archiving** before other work.
(Raised from ~500 on 2026-09-07 — the file's actual history never held at
500 for more than about a week; it steadily regrows to 550-660 between
archiving passes because the project genuinely carries 5-10 concurrent
open, non-trivial threads at once, each with an irreducible minimum of
context. ~600 better matches that real steady state instead of triggering
a proposal with little left to actually compress.)

Archiving means: for Pending items that are fully resolved/deployed/
verified, collapse them to a one-line pointer and move the full narrative
to `docs/session-log/<year-month>.md` (create a new month file when the
current one doesn't fit, following the existing `2026-07.md` pattern).
Leave genuinely open items untouched. Confirm the specific items with
Olga before archiving — don't do it silently.

**Growth-prevention habits, not just periodic cleanup** — the file grows
between archiving passes mainly from two patterns; catch both as they
happen rather than only during a size-triggered pass:

- **A "Shipped"-style running changelog stays in `docs/session-log/`, not
  inline.** Don't add a new "Shipped YYYY-MM-DD — ..." paragraph directly
  into `Focus.md`; append it to `docs/session-log/SHIPPED.md` instead and
  leave `Focus.md`'s own "Recently shipped" line untouched (it already
  points there). Same idea applies to any genuinely-deferred,
  not-yet-started idea with no urgency — it belongs in
  `web/plan/Cross-Stitch.com — Nice-to-Have Ideas.md`, not `Focus.md`.
- **When re-checking an already-tracked open item, replace its status
  paragraph instead of appending a new one on top of the old.** An item
  like the GSC position/halo-effect tracking (Open item #7) is a standing
  watch, not a one-time task — it will accumulate a new "Checked
  YYYY-MM-DD" paragraph every check-back forever if each update just adds
  another paragraph. Keep only the current numbers/conclusion plus enough
  of the "why" to stay actionable; the full history of prior checks is
  already in `docs/session-log/`, so don't duplicate it inline. The same
  applies to the "Done when" checklist: once every sub-part of a line is
  checked off, delete the line entirely (git log and session-log are the
  permanent record) rather than leaving it as a growing list of `[x]`
  entries no one needs to see at session start.

## AI workflow and documentation usage

This repository is the orchestration and knowledge hub for the entire Cross-Stitch platform ecosystem.

Before proposing plans, modifying files, or making architectural assumptions:

1. Read relevant documents under `docs/`
2. Read relevant planning documents under `plan/`
3. Summarize discovered assumptions and constraints
4. Only then propose changes or implementation steps

Do not invent or assume:

- DynamoDB schemas
- AlbumID/DesignID formats
- S3 path structures
- PDF generation conventions
- uploader ↔ website contracts
- Pinterest metadata conventions
- AWS deployment assumptions

The documentation directories are considered the source of truth unless explicitly overridden by newer instructions.

## Workspace awareness

The VS Code workspace includes:

- `docs/` (this folder)
- `../web/`
- `../uploader/`
- `../automation/autopinner/`
- `../shared/`

This folder coordinates work across all parts of the monorepo.

When analyzing integrations or workflows:

- consider both repositories together
- identify cross-repo dependencies
- identify shared contracts
- identify synchronization risks

## Preferred behavior

Prefer:

- planning before coding
- explicit architecture summaries
- identifying missing documentation
- proposing incremental safe changes

Avoid:

- large speculative refactors
- inventing undocumented contracts
- changing multiple repositories without documenting assumptions first
