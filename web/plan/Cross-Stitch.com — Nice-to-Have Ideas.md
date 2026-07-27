# Cross-Stitch.com — Nice-to-Have Ideas

Ideas, deferred decisions, and backlog items that are **not scheduled and
not committed**. Revisit opportunistically when they come up again or when
circumstances change (e.g. organic demand appears, a pattern keeps
recurring) — this is not a backlog to grind through. Split out from
`docs/Focus.md` on 2026-07-26 to keep that file to genuinely active tasks.

## Feature ideas from user feedback

- **Bianca's fabric-merge idea** — merge two designs based on the size of
  fabric the user is working with. Researched 2026-07-08: not standard even
  in paid desktop tools (WinStitch/PCStitch). Deferred, not built.

## Ann persona / blog

- **Full public comments on blog posts** — deferred, not abandoned (decided
  2026-07-25). Add only once organic demand actually shows up (readers
  asking to comment, replying enthusiastically to emails), not
  speculatively upfront. When it happens: DynamoDB confirmed suitable — new
  self-provisioning table (same pattern as `blog-reactions.ts`/
  `editor-events.ts`), PK `slug` / SK `commentId` for per-post ordered
  retrieval, moderation status attribute + GSI (same shape as
  `FeatureRequests`), comments tied to the existing login/session rather
  than anonymous, to avoid becoming a new spam target. Fake seed comments
  were explicitly considered and rejected (deceptive regardless of scale;
  discovery risk undermines the whole "real voice of Ann" project).

## Security / infra decisions not yet made

- **Unauthenticated email-in-body endpoints** — `/api/trial/start`,
  `/api/subscription/status`, `/api/subscription/download-access` take a
  plain `email` field with no session/password/token proving ownership
  (found 2026-07-12, `docs/srs/06-API-Specification.md` §2). Likely
  intentional (called right after PayPal redirect/registration before a
  session cookie exists), not flagged as a bug — but worth a deliberate
  decision: add rate-limiting at least on `/subscription/status`
  (info-disclosure of subscription state by email), or accept the
  trade-off as-is. **Real abuse evidence exists**: some IPs blocked via
  `/review-ip` were download-counter inflation bots exploiting exactly
  this pattern (rotating fake accounts via the same no-auth flow).
- **GSC OAuth write scope** — the stored token is read-only; sitemap
  resubmission after content changes currently requires manual action in
  the GSC UI. Consider redoing OAuth consent with write scope for future
  programmatic resubmission — not decided, no urgency since manual
  resubmission works.
- **`eb health` Red status root cause (2026-07-25, 04:22-06:07 UTC)** —
  self-resolved to Green on its own; the original 04:22 UTC trigger was
  never identified. Moot since fully resolved, but genuinely unexplained
  if it ever recurs.
- **`ConverterPatterns` own `expiresAt`/TTL gap** — different bug class
  from the `EditorEvents`/`SearchQueries` TTL-disabled issue (which was
  fixed via an infra toggle); here the code never writes the `expiresAt`
  attribute at all, so it needs an actual code change. Low priority — only
  23 items affected as of 2026-07-25.

## SEO backlog

- **"Progress tracker" positioning/landing page** — GSC check 2026-07-27
  found zero impressions for "progress tracker" (and variants) in 90 days;
  nothing on the site targets this query at all. Closest existing feature
  is the editor's save-to-account/resume capability (pitched as "Come back
  anytime" on `/photo-to-cross-stitch`), but it's not named or positioned
  as a "progress tracker" anywhere, and there's no dedicated page. Two
  options if revisited: (a) name/reframe the existing save-and-resume
  feature as a "progress tracker" with its own landing page, or (b) a
  real product feature — visual tracking of how many stitches/colors are
  done out of the total — which the existing save-and-resume doesn't
  actually provide today. Not scheduled; revisit if the query keeps
  showing up as a gap or if building (b) becomes cheap for some other
  reason.
- **Near-duplicate design families still needing individual review** —
  deliberately deferred from the 2026-07-25 canonicalization pass because
  they need individual judgment calls, not the same automated fix: "99
  Names of Allah" (8 designs), 2× Cushion Cover, 2× Cat, Sunflower,
  Bookmark groups.

## Tooling

- **MCP server for platform data + IP-review actions** (raised
  2026-07-12) — would replace the ~30 one-off `_check_*.ts` scratch
  scripts in `automation/pinterest-agent/scripts/` with typed tools.
  Revisit only if the scratch-script pattern keeps recurring session
  after session.

## Standing policy (not a task, just a decided rule)

- **Newsletter cadence** — every 2-4 weeks, sent when there's real
  content, not on a rigid calendar (decided 2026-07-10ish, reaffirmed
  since).
