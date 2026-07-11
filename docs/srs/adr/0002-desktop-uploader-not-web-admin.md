# ADR-0002: Desktop application (WPF), not a web admin panel, for publishing

**Status:** Accepted (reflects current implementation)
**Date recorded:** 2026-07-11 (reverse-engineered — no contemporaneous record found)
**Related:** `../05-SAD.md` §4.3, §7, `../04-SRS-Uploader.md`, `../lld/04-LLD-Uploader.md`

## Context

New designs need to be published (files uploaded, catalog row written, Pinterest pin
created) and subscribers need to be emailed about them. This workflow needs a UI of some
kind — either a page in the existing Next.js website's `/admin` area, or a separate
application.

## Decision

Build a standalone WPF desktop application (the Uploader), run locally on the operator's
own machine, rather than a web-based admin panel.

## Consequences

**Positive:**
- Direct local filesystem access to source design batches (chart files, PDF kit variants,
  preview images) sitting on the operator's disk — no upload-from-browser step needed for
  the operator's own working files.
- Relies on the operator machine's existing AWS SDK credential chain — no separate
  authentication/authorization system had to be built for admin access to
  publish-capable AWS credentials (S3 write, DynamoDB write, SES send, Elastic Beanstalk
  restart).
- Matches the actual usage pattern: exactly one operator, no requirement for remote or
  concurrent multi-user publishing.

**Negative / accepted cost:**
- No remote publishing — the operator must be at that specific machine to publish a design
  or send an email.
- No audit trail beyond the in-app status log — no persisted record of who published what,
  when, from where (moot today with one operator, but a real gap if that ever changes).
- Single point of failure: if that machine is unavailable, publishing and subscriber
  emailing both stop, with no fallback path (see also `00-Overview.md` §6.4, "single point
  of operation").
- The application accumulated infrastructure-control privileges (Elastic Beanstalk restart,
  an unused EC2-reboot helper) beyond the minimum a "publish content" tool strictly needs,
  because it runs with the same broad local AWS credentials as everything else the operator
  does on that machine — see `../05-SAD.md` §8.1.
