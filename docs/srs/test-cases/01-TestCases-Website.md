# Test Cases — Website (cross-stitch.com)

**Derived from:** `../use-cases/01-UseCases-Website.md`
**Status:** Draft. "Automated?" column verified against `../09-Test-Plan.md` §2.1 — marked
`Yes` only where an existing Vitest file was confirmed to cover it, `No` otherwise (not
inferred, not assumed).

## TC set for UC-W-01 — Download a design

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-01-01 | Free mode: anonymous download succeeds | High | 1. Set mode=`free`. 2. Visit a design page as anonymous visitor. 3. Click Download. | PDF served directly; `NDownloaded` incremented. | No |
| TC-W-01-02 | Register mode: anonymous download prompts registration | High | 1. Set mode=`register`. 2. Click Download while logged out. 3. Complete registration. | Registration dialog opens; pending download resumes automatically post-registration. | No |
| TC-W-01-03 | Paid mode: no subscription, no trial → paywall | High | 1. Set mode=`paid`. 2. Logged-in user with no subscription/trial clicks Download. | Redirected to plan selection / trial-start offer; no file served. | No |
| TC-W-01-04 | Paid mode: active trial consumes one unit | High | 1. Set mode=`paid`, user has active trial with remaining allowance. 2. Download a design not yet in `TrialDownloadedDesignIds`. | File served; `TrialDownloadsUsed` +1; design ID appended to `TrialDownloadedDesignIds`. | No |
| TC-W-01-05 | Paid mode: re-downloading an already-trial-downloaded design doesn't double-consume | Medium | 1. Same trial user re-downloads a design already in `TrialDownloadedDesignIds`. | File served; `TrialDownloadsUsed` unchanged. | No |
| TC-W-01-06 | Referrer bypass skips the gate regardless of mode | Medium | 1. Set mode=`paid`. 2. Request a download with `Referer` header set to the allow-listed partner domain. | File served with no auth/payment check. | No |
| TC-W-01-07 | Missing new-format PDF falls back to legacy file | Medium | 1. Request a design known to lack per-format PDFs. | Legacy single-PDF URL served instead of a 404. | No |
| TC-W-01-08 | `NDownloaded` not incremented on a blocked download attempt | Low | 1. Set mode=`paid`, user has no access. 2. Attempt download. | `NDownloaded` unchanged; download-access endpoint returns `allowed:false`. | No |

## TC set for UC-W-02 — Discover a design via AI-powered search

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-02-01 | Natural-language query returns structured filters | High | 1. POST `/api/ai-search` with a descriptive query. | 200 with a populated filter object matching the query's intent (manual/LLM-judged, not exact-match assertable). | No |
| TC-W-02-02 | Malformed LLM response degrades gracefully | Medium | 1. Force the Anthropic call to return non-JSON (mocked). 2. Call `/api/ai-search`. | 500 `{error:"Could not parse AI response"}`, not an unhandled exception. | No |
| TC-W-02-03 | Image search returns candidate designs | High | 1. POST `/api/image-search` with a valid photo. | 200 with `designIds` + `description`; `logSearch` called with `source:'image'`. | No |
| TC-W-02-04 | Personalized section excludes already-viewed designs | Medium | 1. POST `/api/personalized` with `viewedIds` containing designs that are also in their own neighbor lists. | Returned `designs` never include an ID present in `viewedIds`. | No |
| TC-W-02-05 | Related-searches never errors, even on bad input | Low | 1. POST `/api/related-searches` with empty/invalid `semanticIds`. | 200 `{suggestions:[]}`, not a 400/500. | No |

## TC set for UC-W-03 — Register and verify a new account

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-03-01 | Registration creates unverified account and sends email | High | 1. POST `/api/register-only` with valid new email. | 200 `{ok:true}`; user row created with `Verified:false`; verification email sent. | No |
| TC-W-03-02 | Duplicate email registration is rejected | High | 1. POST `/api/register-only` with an already-registered email. | 409 `{error:"Email already registered"}`. | No |
| TC-W-03-03 | Verification link marks account verified | High | 1. GET `/api/register-only/verify?token=<valid>`. | User's `Verified` flips true; 200 or redirect per `cid` presence. | No |
| TC-W-03-04 | Expired/invalid token is rejected | Medium | 1. GET `/api/register-only/verify?token=<expired>`. | 400 `{error:"Invalid or expired token"}`; `Verified` unchanged. | No |
| TC-W-03-05 | Magic-link login authenticates without a password | High | 1. POST `/api/auth/login-from-email` with a valid `cid`. | 200 with `email`/`firstName`; `LastEmailEntry` updated. | No |
| TC-W-03-06 | Bot-suspect account cannot log in via either path | High | 1. Flag a test account `BotSuspect:true`. 2. Attempt `/api/auth/login` and `/api/auth/login-from-email`. | Both rejected regardless of correct credentials/valid `cid`. | No |

## TC set for UC-W-04 — Subscribe to a paid plan

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-04-01 | Plan IDs resolve from env when set | Medium | 1. Set `PAYPAL_MONTHLY_PLAN_ID`/`PAYPAL_YEARLY_PLAN_ID`. 2. POST `/api/subscription/plan`. | 200 returns the env-configured IDs. | **Yes** — `src/app/api/subscription/plan/route.test.ts` |
| TC-W-04-02 | Plan IDs fall back to hardcoded defaults when env unset | Medium | 1. Unset both env vars. 2. POST `/api/subscription/plan`. | 200 returns the hardcoded default plan IDs. | **Yes** — same file |
| TC-W-04-03 | Webhook activation updates subscription state | High | 1. Send a valid, signed `BILLING.SUBSCRIPTION.ACTIVATED` webhook. | User's `SubscriptionActive:true`; a `SubscriptionEvents` row appended. | No |
| TC-W-04-04 | Invalid webhook signature is rejected | High | 1. Send a webhook with a bad/missing signature (and skip-verification flag off). | 400 `{error:"Invalid webhook signature"}`; no state change. | No |
| TC-W-04-05 | Cancellation event deactivates subscription | High | 1. Send `BILLING.SUBSCRIPTION.CANCELLED` for an active subscriber. | `SubscriptionActive:false`; event recorded. | No |
| TC-W-04-06 | Trial start enforces required fields for a new account | Medium | 1. POST `/api/trial/start` with email only, no password/firstName, for a non-existent user. | 400 `{error:"Password and first name are required..."}`. | No |

## TC set for UC-W-05 — Vote on a design

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-05-01 | First vote is recorded | High | 1. POST `/api/designs/[id]/like` `{direction:'up'}` for a design with no prior vote from this identity. | 200 with incremented `count`, `currentUserVote:'up'`. | No |
| TC-W-05-02 | Re-clicking the same vote removes it | Medium | 1. Vote up. 2. Vote up again. | Vote count reverts; `currentUserVote:null`. | No |
| TC-W-05-03 | Opposite vote replaces the prior one | Medium | 1. Vote up. 2. Vote down. | Up-count decrements, down-count increments; `currentUserVote:'down'`. | No |
| TC-W-05-04 | Rate limit blocks excessive voting from one IP | High | 1. Send 21 vote-related requests within 60s from one IP. | The 21st request returns 429 `{error:"Too many requests"}`. | No |
| TC-W-05-05 | `getUserDesignVotes` paginates and sorts correctly | Medium | 1. Call `getUserDesignVotes` for a user with votes across multiple GSI pages. | All pages retrieved; results sorted; invalid entries filtered. | **Yes** — `src/lib/design-likes.test.ts` |
| TC-W-05-06 | Vote query rejects malformed email before hitting DynamoDB | Low | 1. Call `getUserDesignVotes` with an invalid email string. | Rejected before any DynamoDB call is made. | **Yes** — same file |

## TC set for UC-W-06 — Submit in-context feedback

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-06-01 | Minimum-length text is accepted | Medium | 1. POST `/api/feature-requests` with `text` of 5+ chars. | 200 `{ok:true, id}`. | No |
| TC-W-06-02 | Too-short text is rejected | Medium | 1. POST with `text` < 5 chars. | 400 `{error:"Please write at least a few words."}`. | No |
| TC-W-06-03 | Over-length text is rejected | Low | 1. POST with `text` > 2000 chars. | 400 `{error:"...keep it under 2000 characters."}`. | No |
| TC-W-06-04 | Anonymous submission works without a session | Medium | 1. POST with no session cookie, no `email`. | 200 `{ok:true}`; `userId` absent on the stored record. | No |
| TC-W-06-05 | Editor-context fields are captured when present | Low | 1. POST with `patternWidth`/`patternHeight`/`editorTimeSeconds` populated. | Stored record includes those fields verbatim. | No |

## TC set for UC-W-07 — Reset a forgotten password

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-07-01 | Reset request always returns the same message | High | 1. POST `/api/auth/request-password-reset` for both an existing and a non-existent email. | Both return identical 200 `{ok:true, message:"If this email is registered..."}` — no account-existence leak. | No |
| TC-W-07-02 | Valid token resets the password | High | 1. Request reset. 2. POST `/api/auth/reset-password` with the issued token + matching passwords. | 200; password updated; token no longer usable. | No |
| TC-W-07-03 | Expired/reused token is rejected | High | 1. POST `/api/auth/reset-password` with an already-consumed or expired token. | 400 `{error:"The reset link is invalid or has expired..."}`. | No |
| TC-W-07-04 | Mismatched confirmation is rejected | Medium | 1. POST with `password` ≠ `confirmPassword`. | 400 `{error:"Passwords do not match"}`. | No |
| TC-W-07-05 | Under-length password is rejected | Low | 1. POST with a 5-char password. | 400 `{error:"Password should be at least 6 characters long"}`. | No |

## TC set for UC-W-08 — Triage feature requests

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-W-08-01 | Non-admin cannot list feature requests | High | 1. GET `/api/admin/feature-requests` with a non-admin session. | 403 `{error:"Access denied"}`. | No |
| TC-W-08-02 | Unauthenticated request is rejected | High | 1. GET `/api/admin/feature-requests` with no session. | 401 `{error:"Login required"}`. | No |
| TC-W-08-03 | Admin can list and update status | High | 1. GET as admin. 2. PATCH a request's `status`. | List returns requests; PATCH returns 200 `{ok:true}` and persists new status. | No |
| TC-W-08-04 | Invalid status value is rejected | Medium | 1. PATCH with `status:"bogus"`. | 400 `{error:"Invalid status"}`. | No |
