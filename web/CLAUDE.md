# CLAUDE.md

Project-level guidance for Claude Code working in the cross-stitch workspace.

## Progress tracking — mark work done as soon as it's done

When you finish a milestone — or any discrete part of one (a step in an implementation plan, a checked-off item in `FOCUS.md`, a numbered step in the milestone doc) — immediately mark it done in *every* document that tracks it. Don't wait to be told. The work being done is the trigger.

Places that track milestone progress:

- [`FOCUS.md`](FOCUS.md) at this repo root — checkbox + date + short verification note (match the existing entry pattern).
- The relevant milestone document under [`../cross-stitch-platform-docs/plan/cross-stitch/`](../cross-stitch-platform-docs/plan/cross-stitch/) — typically `Pinterest AI Agent — Milestones and Roadmap.md` or `Pinterest AI Agent — Design-Level Intelligence.md`. If a step is one undifferentiated bullet covering several sub-tasks, convert it to a per-task checklist on first partial completion rather than waiting for the whole step.

If a step also has a commit hash convention (see prior FOCUS.md entries), include the commit hash once the work is committed — but don't block the checkbox on the commit.

## While SOAK-WINDOW.md exists: check it whenever you read FOCUS.md

The Milestone 5 dual-write soak window is being tracked in [SOAK-WINDOW.md](SOAK-WINDOW.md). Whenever you orient on cross-stitch work by reading [FOCUS.md](FOCUS.md), also open SOAK-WINDOW.md and look at the daily log table. Two cases to surface to Olga without being asked:

- **Today's date is on or past day 7 AND days 1–7 all show ✓**: tell Olga the soak is complete and offer to walk through the cutover checklist (read cutover → strip `fs.writeFileSync` calls → mark Milestone 5 complete → delete SOAK-WINDOW.md and remove this rule). Do **not** start any cutover step unilaterally — they are irreversible. Confirm explicitly first.
- **Any day in the log shows ✗ (failure)**: tell Olga the soak counter reset and which day broke the streak. Per the recovery rule in SOAK-WINDOW.md, the 7-day clock only counts consecutive green days.

Once Milestone 5 ships and SOAK-WINDOW.md is deleted, also remove this section from CLAUDE.md.
