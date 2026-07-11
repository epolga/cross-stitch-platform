# ADR-0005: Preserve legacy `.aspx` URLs via catch-all routing

**Status:** Accepted (reflects current implementation)
**Date recorded:** 2026-07-11 (reverse-engineered — no contemporaneous record found)
**Related:** `../05-SAD.md` §4.1, `../01-SRS-Website.md` FR-CAT-4, NFR-2,
`../lld/01-LLD-Website.md` §5.3

## Context

The site was previously built on ASP.NET, with URLs like
`/Free-<Album>-Charts.aspx` and `/<Caption>-<AlbumID>-<NPage>-Free-Design.aspx`. The
platform has since been rebuilt on Next.js with a cleaner modern URL scheme
(`/albums/{albumId}`, `/designs/{designId}`). Fifteen-plus years of search-engine ranking
signal is attached to the old URLs.

## Decision

Keep the legacy `.aspx`-style URLs permanently reachable and indexable, resolved by a
catch-all Next.js route (`[slug]`) that parses the legacy slug pattern and server-renders
the equivalent modern page content directly at that URL — not a redirect, a direct render,
so search engines see 200 rather than a redirect chain.

## Consequences

**Positive:**
- Preserves accumulated SEO ranking/backlink equity through a full platform rewrite,
  avoiding the traffic loss typically associated with a large-scale URL-scheme migration.
- No dependency on an external URL-rewrite layer (e.g. a CDN rewrite rule) — the mapping
  logic lives in the application alongside everything else, versioned with the rest of the
  codebase.

**Negative / accepted cost:**
- Permanent routing complexity: the catch-all slug parser must keep working indefinitely,
  with no announced retirement plan or sunset date — it is not a temporary migration shim
  that gets deleted later, it is a standing part of the routing surface.
- Two URL schemes for the same content exist simultaneously forever (unless a future
  decision changes this), which is a small ongoing maintenance and testing surface (both
  schemes need to keep working correctly as the underlying page templates evolve).
