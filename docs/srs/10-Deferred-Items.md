# Deferred Items — cross-stitch-platform documentation

**Status:** Living document — append to this, don't let deferred decisions get lost across
sessions.
**Date started:** 2026-07-11

This tracks documentation/decisions explicitly deferred during the `docs/srs/` effort —
things that came up, were judged out of scope for now, and need a real decision (not more
reverse-engineering) before they can move forward. Unlike the rest of `docs/srs/`, this
file is not "as-built" documentation — it's a parking lot.

## Open items

| Item | Deferred on | Why deferred | What's needed to unblock |
|---|---|---|---|
| **Data Migration Plan** | 2026-07-11 | Every other `docs/srs/` document reverse-engineers *current* behavior; a migration plan requires deciding the *target* state for known data debt (`00-Overview.md` §6, `05-SAD.md` §5.2): hash+salt passwords, reconcile the two user tables, canonicalize the Pinterest pin-ID attribute, add schema versioning. Olga: "не хочу пока ничего менять" — no appetite yet to commit to any of these changes. | Olga decides, per item, whether/when to actually change it. Once even one item has a real target state, that item alone can get a migration plan — doesn't need to wait for all of them. |
| **Backup and Disaster Recovery Plan** | 2026-07-11 | No existing backup/DR strategy was found or mentioned anywhere across the whole `docs/srs/` research effort (no DynamoDB point-in-time recovery, S3 versioning, or restore procedure referenced in any component). Writing this doc now would mean inventing a plan from nothing, not documenting one — and it needs RTO/RPO targets, which are a business decision, not something derivable from code. | Olga decides: (a) whether backup/DR is worth investing in given the single-operator scale of this platform, and if so (b) what RTO/RPO is acceptable, before a plan can be written meaningfully. |
| **CI/CD Documentation** | 2026-07-11 | Confirmed no CI/CD pipeline exists (`.github/` absent, no workflow files anywhere in the repo) — deploys are entirely manual (`/deploy-web` skill, Uploader's EB restart, presumed-manual Lambda/autopinner deploys). Not deferred pending a decision so much as **not applicable today** — listed here so it isn't proposed again without checking first. | Only relevant again if/when an actual CI/CD pipeline gets built. |

## Resolved items

*(none yet — move an item here, with the resolution and date, once it's actually decided
and either written up or explicitly dropped)*
