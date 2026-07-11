# ADR-0001: Split Pinterest pin-creation (autopinner) from analytics/defense (pinterest-agent)

**Status:** Accepted (reflects current implementation)
**Date recorded:** 2026-07-11 (reverse-engineered — no contemporaneous record found)
**Related:** `../05-SAD.md` §4.2, `../03-SRS-Pinterest-Automation.md`, `../lld/03-LLD-Pinterest-Automation.md`

## Context

The platform needs to both (a) create Pinterest pins for newly published designs and (b)
continuously pull Pinterest/GA4/AdSense analytics, run AI-assisted trend analysis, detect
and help defend against abusive traffic, and alert the operator. These could be built as
one process or as two.

## Decision

Build them as two independently deployed components:

- **autopinner** (.NET 8 worker) — the platform's only component with write access to
  Pinterest's pin-creation endpoint. Reads `CrossStitchItems`, claims unpinned designs, and
  posts pins.
- **pinterest-agent** (Node/TypeScript, AWS Lambda, daily cron) — read-only against
  Pinterest (ads/pin analytics), plus GA4/AdSense reads, AI analysis, IP-abuse
  detection/defense, and all operator notifications. Never calls a pin-creation endpoint.

Both consume the same Pinterest OAuth/upload logic via the shared `CrossStitch.Shared`
library rather than each reimplementing it.

## Consequences

**Positive:**
- A bug or runaway loop in the analytics/AI/reporting pipeline cannot accidentally create
  or corrupt Pinterest pins.
- A stuck or misbehaving autopinner daemon cannot silently corrupt the daily business
  report or suppress an IP-abuse alert.
- Each component can be deployed, scaled, and reasoned about independently — one is a
  scheduled Lambda, the other a long-running or cron-triggered worker, matching their very
  different execution profiles (a burst of ~14 read-heavy report steps vs. a
  claim-and-post loop with real-world rate limits).

**Negative / accepted cost:**
- OAuth-client and Pinterest-upload logic is duplicated at the *integration point* level
  (two separate consumers of `CrossStitch.Shared`, two separate credential-loading paths),
  mitigated but not eliminated by the shared library.
- No single place shows "everything Pinterest-related" end to end; understanding the full
  picture requires reading both components' code together (this ADR, and the combined
  `03-SRS-Pinterest-Automation.md`, exist partly to compensate for that).
