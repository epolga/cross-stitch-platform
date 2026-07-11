# Security and Threat Model — cross-stitch-platform

**Status:** Draft, consolidating security-relevant findings already established across
`01`–`14` into one risk-rated view — no new code was read specifically for this document;
every threat below cites where it was originally found.
**Date:** 2026-07-11
**Severity scale (qualitative, not a formal CVSS score):** informed by impact if exploited
× how exposed/likely the vector is, given what's already known about this platform's real
traffic patterns (see `12-Runbook.md` — this site has active, ongoing scraping/abuse
attempts, which raises likelihood for several items below above "theoretical").

## 1. Assets

| Asset | Why it matters |
|---|---|
| User credentials (`CrossStitchUsers.Password`, legacy `OpenPwd`) | Direct account takeover if leaked; password reuse makes this a cross-site risk for users too |
| User PII (email, name, IP-adjacent vote/download history) | Privacy exposure, potential regulatory relevance (GDPR-adjacent, not assessed here — see §5) |
| Revenue-controlling state (`SubscriptionActive`, trial counters, PayPal subscription IDs) | Direct financial impact if manipulable |
| Third-party credentials (Pinterest, Anthropic, PayPal, AWS, SES, Telegram) | Blast radius extends beyond this platform — a leaked Pinterest token could post/alter content on the real Pinterest account; a leaked Anthropic key is billable by an attacker |
| Site availability | Direct revenue impact (ads, subscriptions) and SEO impact if extended downtime |
| Design catalog integrity | Reputational — the Uploader is the sole writer with no existence-check (`04-LLD-Uploader.md` §2.1) |

## 2. Trust boundaries

```
Internet (anonymous, includes known-hostile traffic)
   │
   ▼
AWS WAF (IP allow/block only — no request-content filtering documented)
   │
   ▼
Website (Elastic Beanstalk) ──── session cookie (JWT, HS256, SESSION_SECRET) ────▶ browser
   │
   ├──▶ DynamoDB (broad table access from the Website's own IAM role — scope not verified in this session)
   ├──▶ PayPal (webhook inbound, signature-gated — see T-6)
   ├──▶ Anthropic API (outbound, API key)
   └──▶ SES (outbound email)

Operator's machine (Uploader) ──── default AWS SDK credential chain ────▶ S3, DynamoDB, SES, Elastic Beanstalk, EC2(unused)
                                ──── App.private.config secrets ────▶ Pinterest, Anthropic

pinterest-agent (Lambda) ──── scoped IAM role (deploy.ps1) ────▶ DynamoDB (2 tables, scoped actions),
                                                                    S3 (2 buckets, scoped),
                                                                    SES (FromAddress-restricted),
                                                                    WAF (1 IP set, scoped)
```

**The one component with a demonstrably least-privilege IAM policy is pinterest-agent**
(`11-Deployment-Guide.md` §3.1 — every permission is scoped to a specific resource ARN and
action set, re-applied on every deploy). **The Uploader is the opposite end of the
spectrum**: it runs with whatever broad access the operator's own AWS credentials happen to
grant, which is almost certainly wider than "S3 write to one bucket, DynamoDB write to two
tables, SES send, EB restart" — the actual minimum it needs (ADR-0002 already flags this).

## 3. Threat catalog

| ID | Threat | Asset | Vector | Current mitigation | Gap / residual risk | Severity |
|---|---|---|---|---|---|---|
| T-1 | Credential-stuffing / offline cracking after a data exposure | User credentials | Any DynamoDB read access (backup, snapshot, misconfigured IAM, insider) exposes **plaintext** passwords directly — no hash to crack | None — `01-SRS-Website.md` NFR-7 | Full account takeover for every user simultaneously, no delay; also endangers users who reused this password elsewhere | **High** |
| T-2 | Credentials leaked via application logs | User credentials | `verifyUser` in `data-access.ts` logs submitted email+password to stdout (`01-SRS-Website.md` §6, NFR-8) | None | Anyone with log access (CloudWatch/EB log access) sees plaintext credentials in transit, not just at rest | **High** |
| T-3 | Session forgery | Any authenticated session, including admin | `SESSION_SECRET` compromise (weak secret, leaked env var, secret reused across environments) | JWT signing, httpOnly cookie | No secrets manager (`05-SAD.md` §8.1) — the secret lives in plain env config with no rotation mechanism observed | **High** (low likelihood, very high impact) |
| T-4 | Vote/download-count manipulation | Design catalog integrity, potentially revenue (trial-download accounting) | Vote/like identity is resolved from an email param/header, **not** cryptographically tied to the session (`06-API-Specification.md` §3 footnote) — a caller can supply any email | Rate limiting (20/min/IP) | Rate limiting slows but doesn't prevent a low-and-slow script from inflating/deflating vote counts or probing trial-download state for arbitrary emails | **Medium** |
| T-5 | SSRF via the image-import feature | Internal network reachability from the Website's runtime | `GET /api/import-image-url?url=` | Private/loopback/link-local IP resolution check, content-type check, size cap, 10s timeout (`06-API-Specification.md` §5) | Verified present and reasonably thorough — the one place in this codebase where a real SSRF-class vulnerability was clearly anticipated and mitigated, not just assumed away | **Low** (mitigated) |
| T-6 | Forged PayPal webhook events | Revenue-controlling state | `POST /api/paypal-webhook` | Signature verification, **unless `PAYPAL_WEBHOOK_SKIP_SIGNATURE_VERIFICATION=true`** | If that flag is ever left `true` in production (e.g. a config mistake copied from a local-testing setup), anyone can POST a fake `BILLING.SUBSCRIPTION.ACTIVATED` event and grant themselves a subscription for free | **High if misconfigured, else Low** — verify the flag is unset in production as a standing operational check (add to `12-Runbook.md` pre-deploy checklist) |
| T-7 | Rate limiter bypass at scale | Vote/blog-reaction/download-count endpoints, IP-detection accuracy | In-memory, per-process limiter (`05-SAD.md` §5.1 / `01-LLD-Website.md` §5.1) | None beyond "single instance today" | If the Website is ever scaled to multiple EB instances, the effective limit multiplies by instance count with no code change required to notice — a silent regression waiting to happen on a future scaling decision | **Medium** (currently low likelihood since single-instance, becomes real the moment that changes) |
| T-8 | IP-block evasion | WAF-based abuse defense | WAF blocks by IP `/32` | Human-reviewed classification (`03-SRS-Pinterest-Automation.md` FR-IP-3), permanent history (`IP_HISTORY`) for repeat-offender recognition | Inherent to IP-based blocking — trivially evaded by rotating source IPs (a genuinely sophisticated/motivated actor isn't meaningfully deterred); this is a known, accepted limitation of the chosen defense strategy (ADR-0003), not an oversight | **Medium** (accepted risk, not a bug) |
| T-9 | Excess privilege on a compromised operator machine | Every AWS resource the Uploader can touch, plus Pinterest/Anthropic credentials in `App.private.config` | Malware, phishing, or physical access to the operator's machine | None beyond OS-level machine security (outside this platform's scope) | The Uploader's unused `EC2Helper.cs` (`04-LLD-Uploader.md` §7) is a concrete symptom: credentials broader than the tool's actual job. A single compromised machine can read/write the catalog, send mass email, and access Pinterest/Anthropic accounts | **High** (impact), likelihood tied to general endpoint security, not this platform's code |
| T-10 | Secrets sprawl across three incompatible mechanisms | Every credential in the platform | Env vars (Website, pinterest-agent), `.env` (pinterest-agent), gitignored `App.private.config` (Uploader) | Each is "not committed to git," which is the only consistent property across all three | No rotation policy, no centralized audit of who/what can read which secret, no consistent format — `05-SAD.md` §8.1 already flags this; restated here as a security (not just architecture) concern | **Medium** |
| T-11 | Bot-account persistence after IP block | Website integrity (fake accounts, spam, download/like manipulation) | A `BotSuspect`-worthy account, once created, is only ever flagged **manually** (`01-SRS-Website.md` §6 NFR-4, `00-Overview.md` §6.3) | `BotSuspect` blocks login when set | Blocking the originating IP (Pinterest-automation side) does nothing to an already-registered account reachable from a fresh IP — the two defenses don't talk to each other | **Medium** |
| T-12 | No-existence-check catalog overwrite | Design catalog integrity | Uploader's `InsertItemIntoDynamoDbAsync` (`04-LLD-Uploader.md` §2.1) | None — raw `PutItem`, no conditional check | Requires a specific key collision to trigger (low likelihood in normal operation, since IDs are computed as max+1), but has no guard if that assumption is ever violated (e.g. two publish attempts racing, or a manual DynamoDB edit shifting the "max" the next publish computes from) | **Low-Medium** |
| T-13 | Etsy scaffold with placeholder credentials | Dead code surface | `EtsyHelper.cs` (`04-LLD-Uploader.md` §5) — not wired to any button today | Currently inert | If someone wires a button to it later assuming it's production-ready (the placeholder credentials look plausible at a glance), that's a real-credential leak or broken-integration risk introduced by mistake, not by attack | **Low** (today), worth deleting rather than leaving as a trap |

## 4. What's demonstrably done well

Worth stating explicitly, not just cataloging gaps:

- **pinterest-agent's IAM role is genuinely least-privilege**, scoped per-resource,
  per-action, and re-verified on every deploy (§2).
- **The SSRF guard on `/api/import-image-url` is real and reasonably complete** (T-5) —
  private-IP resolution check, content-type validation, size cap, timeout.
- **PayPal webhook signature verification exists by default** — the risk (T-6) is
  specifically about the escape-hatch flag, not the absence of verification.
- **The IP-abuse defense's human-in-the-loop design (ADR-0003) is a deliberate, documented
  trade-off**, not a gap — it correctly prioritizes not silently dropping legitimate traffic
  over faster automated response.

## 5. Out of scope for this document

- **Formal compliance assessment** (GDPR/CCPA applicability, data-retention policy) — this
  document identifies that PII is stored (§1) and that T-1/T-2 make that PII especially
  exposed, but does not attempt a legal compliance determination. If this becomes a real
  question, it belongs in `10-Deferred-Items.md` alongside the Data Migration Plan, since
  remediating T-1/T-2 (password hashing) is a prerequisite for most compliance postures
  anyway.
- **Physical/endpoint security of the operator's machine** (T-9's root cause) — outside this
  platform's own code and configuration.
- **A formal penetration test** — this document is a code-and-config-based review, not a
  dynamic security assessment; it should inform, not replace, one if that's ever
  commissioned.

## 6. Relationship to the Deferred Items log

T-1 and T-2 are exactly the kind of issue `10-Deferred-Items.md`'s Data Migration Plan entry
already anticipates (password hashing named explicitly there). This threat model doesn't
duplicate that entry — it explains *why* that deferred item matters in security terms, so
that when Olga does decide to prioritize it, the reasoning is already written down rather
than needing to be reconstructed.
