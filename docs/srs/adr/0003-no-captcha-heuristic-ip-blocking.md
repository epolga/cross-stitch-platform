# ADR-0003: No CAPTCHA; heuristic detection + human-reviewed IP blocking instead

**Status:** Accepted (reflects current implementation)
**Date recorded:** 2026-07-11 (reverse-engineered — no contemporaneous record found)
**Related:** `../05-SAD.md` §8.1, `../01-SRS-Website.md` NFR-4, `../03-SRS-Pinterest-Automation.md`
FR-IP-1…FR-IP-7, `../lld/03-LLD-Pinterest-Automation.md` §4

## Context

The site is a bot/scraper/abuse target (fake registrations, download-counter inflation,
like-spam, catalog scraping, exploit probing). A common mitigation is CAPTCHA on
registration and other sensitive endpoints.

## Decision

Do not use CAPTCHA anywhere. Instead, combine three lighter-weight mechanisms:

1. Client-side behavioral scoring (mouse/keyboard/touch/scroll signals) surfaced to the
   operator on registration, not used to block automatically.
2. Per-endpoint rate limiting (design votes, blog reactions) — see `01-SRS-Website.md`
   NFR-3.
3. IP-level detection (automated, alert-only) feeding a **human-reviewed** decision to
   block or watch, enforced at the network edge via AWS WAF — never an automated block
   (`03-SRS-Pinterest-Automation.md` FR-IP-3).

## Consequences

**Positive:**
- No CAPTCHA friction for legitimate visitors on a content/e-commerce-adjacent site where
  conversion (registration, download, purchase) friction directly costs revenue.
- The human-in-the-loop IP review step avoids the single biggest risk of *automated*
  IP blocking: a false positive (a legitimate high-volume crawler, a corporate NAT serving
  many real users) silently and irreversibly dropping real traffic. This is explicit in the
  detector's own code comment.
- The permanent `IP_HISTORY` record (never expires, unlike the enforcement records) means
  this manual-review cost doesn't have to be paid from scratch for a repeat offender.

**Negative / accepted cost:**
- Requires ongoing, recurring manual review effort from the operator (mitigated, not
  eliminated, by the AI-assisted `/review-ip` workflow) — this does not scale to
  high-volume abuse without either automating more of the decision or accepting slower
  response time.
- No protection against a single well-behaved (low-request-volume) bot registration or
  vote — the heuristics here are tuned for volume-based and pattern-based abuse, not for a
  single carefully-paced malicious actor.
- Bot mitigation is fragmented across at least three independently-tuned mechanisms
  (behavioral score, rate limits, IP review) with no single dial to turn if abuse tolerance
  needs to change platform-wide.
