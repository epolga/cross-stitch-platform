# CLAUDE.md

Project-level guidance for Claude Code working in the cross-stitch workspace.

## Progress tracking — mark work done as soon as it's done

When you finish a milestone — or any discrete part of one (a step in an implementation plan, a checked-off item in `FOCUS.md`, a numbered step in the milestone doc) — immediately mark it done in *every* document that tracks it. Don't wait to be told. The work being done is the trigger.

Places that track milestone progress:

- [`FOCUS.md`](FOCUS.md) at this repo root — checkbox + date + short verification note (match the existing entry pattern).
- The relevant milestone document under [`../cross-stitch-platform-docs/plan/cross-stitch/`](../cross-stitch-platform-docs/plan/cross-stitch/) — typically `Pinterest AI Agent — Milestones and Roadmap.md` or `Pinterest AI Agent — Design-Level Intelligence.md`. If a step is one undifferentiated bullet covering several sub-tasks, convert it to a per-task checklist on first partial completion rather than waiting for the whole step.

If a step also has a commit hash convention (see prior FOCUS.md entries), include the commit hash once the work is committed — but don't block the checkbox on the commit.

## New DynamoDB tables need an explicit IAM grant before production use

The EB EC2 role's DynamoDB access (`CrossStitchDynamoDBAccessPolicy`, an inline policy on `aws-elasticbeanstalk-ec2-role`) is a manual per-table allowlist, not a wildcard — `ensureTable()` (the pattern used throughout `web/src/lib/*.ts` to auto-create a table on first use) only creates the table, it does **not** grant the running app permission to read/write it. A table missing from the policy fails every real request against it with `AccessDeniedException`, and because that's usually caught deep in a best-effort/non-fatal code path, it can fail silently for a long time before anyone notices.

**This has happened for real twice:**
- 2026-08-08 — new AI-draft-review tables (`AiDesignGenerations` etc.) weren't in the policy; patterns were unloadable in the admin review UI.
- 2026-09-02 — `EmailEntryEvents` wasn't in the policy; every newsletter click-through silently failed to record (real clicks were happening — confirmed live in CloudWatch logs — but the campaign's own tracking table showed zero, because the write was rejected and swallowed by a `catch` block that only logs).

**Whenever a new table is added (or exercised for the first time in production)**, add it to `CrossStitchDynamoDBAccessPolicy`'s resource list before relying on it working: `aws iam get-role-policy --role-name aws-elasticbeanstalk-ec2-role --policy-name CrossStitchDynamoDBAccessPolicy`, add the table's ARN (+ `/index/*`) to the appropriate statement, `aws iam put-role-policy` to save it back. This is a production IAM change — confirm with Olga first, same as any other sensitive AWS action.

## Sitemap lastmod for static pages

`web/src/app/sitemap.xml/route.ts` has a `STATIC_PAGE_LASTMOD` map — one date per static route (pages with no DynamoDB row behind them, e.g. `/`, `/WhyCrossStitch`, `/exercises`). Designs and albums get their `<lastmod>` from a real `LastModifiedAt` DB field stamped automatically by whichever script writes their content; static pages have no such automatic path, so this map is hand-maintained.

**Whenever you deploy a change to a static page's route file** (the ones listed in `STATIC_PAGE_LASTMOD`), update that page's date to the date of **the deploy that ships it** — not the date you edited or committed the file. What matters is when a crawler would actually see the new content; a commit that sits undeployed for days would otherwise tell Google the page changed before it really did. An unbumped (or wrongly-dated) entry here silently breaks the sitemap's `<lastmod>` signal to Google for that page — same failure mode as the bug this map was built to fix in the first place (see `docs/integration/dynamodb-schema.md` §4.2, `LastModifiedAt` row, 2026-07-25).

