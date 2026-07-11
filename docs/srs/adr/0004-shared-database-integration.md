# ADR-0004: Shared-database integration (DynamoDB) instead of internal APIs between components

**Status:** Accepted (reflects current implementation)
**Date recorded:** 2026-07-11 (reverse-engineered — no contemporaneous record found)
**Related:** `../05-SAD.md` §5.1, §6, `../00-Overview.md` §5

## Context

Four independently deployed components (Website, Uploader, pinterest-agent, autopinner)
need to share state — most centrally, the design catalog and user data. This can be done
by having each component expose an API that others call, or by having every component read
and write the same underlying data store directly.

## Decision

Use AWS DynamoDB tables (`CrossStitchItems`, `CrossStitchUsers`, and others) as the
platform's de facto integration layer: every component that needs another's data connects
to DynamoDB directly, with no internal API layer between components.

## Consequences

**Positive:**
- Simplicity: no internal service endpoints to design, secure, version, or keep available —
  significant for a small, single-operator platform where standing up and operating an
  internal API gateway would be pure overhead relative to its benefit.
- Zero network-hop latency and no additional failure mode (an internal API being down)
  between components that need the same data.
- DynamoDB's own primitives (conditional writes) are sufficient for the one place real
  cross-component concurrency control is needed (autopinner's exactly-once pin claiming,
  `../lld/03-LLD-Pinterest-Automation.md` §5.5) — no separate coordination service was
  required.

**Negative / accepted cost:**
- No enforced schema contract between writers and readers: every component hard-codes its
  own understanding of each table's shape, so a schema change in one writer is only caught
  by *readers* failing at runtime, not by any build- or deploy-time check
  (`../05-SAD.md` §5.2).
- Data-quality drift has accumulated with nothing structurally preventing it: six historical
  spellings of the Pinterest pin-ID attribute, two parallel user tables (legacy
  `CrossStitchItems` `USER` rows and the newer `CrossStitchUsers` table) that were never
  fully consolidated, and newer Website features (saved patterns, likes, feature requests,
  etc.) whose tables were never added to the formal schema document.
- No cross-table transactions: a multi-step, multi-service flow (e.g. the Uploader's
  publish sequence touching S3, Pinterest, and DynamoDB) has no distributed-transaction
  guarantee and no compensating-action mechanism — see `00-Overview.md` §6.2.
