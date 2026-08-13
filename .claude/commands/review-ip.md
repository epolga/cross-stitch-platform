# Review and act on suspicious IPs

Take one or more IP addresses (usually pasted from the daily Telegram "suspicious IP" alert, or from `npm run watch-ip` entries whose watch period just expired) and decide, per IP: **block**, **watch** (probation with an expiry, not a block), or **no action** — then act on that decision only after the user confirms.

All commands below run from the `automation/pinterest-agent/` directory.

## Steps

1. **Gather evidence.** Run via a stdin heredoc, not a quoted CLI argument:
   ```
   cat <<'EOF' | npx tsx scripts/analyze-ip.ts --date=YYYY-MM-DD
   <paste the user's IP list here, exactly as given>
   EOF
   ```
   `analyze-ip.ts` extracts IPv4 tokens from whatever it's given — paste the raw alert block as-is (newlines, `ip: N req` suffixes and all), no need to clean it up first. **Always use the heredoc/stdin form, not a quoted multi-line CLI argument** — on Windows, `npx` resolves to `npx.cmd` (a batch file), and batch-file argument parsing truncates a quoted argument at its first embedded newline, silently dropping every IP after the first. A single-line input (one IP, or space-separated IPs) is fine as a plain CLI argument either way.

   Omit `--date` to default to yesterday (UTC), matching what the daily suspicious-IP alert covers. This prints, per IP: reverse DNS (PTR record), HTTP methods, response status codes, top 8 requested paths, and total distinct paths hit.

2. **Check for already-known IPs first.** Before recommending anything, check whether the IP is already in `BLOCKED_IP` or `WATCHED_IP` — if there's an existing entity for it, say so and ask whether the user wants to extend/replace it rather than silently creating a duplicate entry. Also check `IP_HISTORY` (permanent, non-expiring log written automatically by `putBlockedIp`/`putWatchedIp`) — this is how a repeat offender is recognized even after its earlier block/watch TTL has lapsed and the operational row is gone. If an IP has prior history, factor that into the classification (e.g. a repeat offender that was watched-then-lapsed and is back with the same pattern is stronger evidence for block, not another watch).

2b. **Check the IP isn't Olga's own current one before recommending a block.** Fetch her current public IP (e.g. `curl -s https://api.ipify.org` from wherever the session is running — it runs on her own machine) and compare it against every IP in the list. If any match, flag it explicitly and do not recommend blocking it, even if the evidence otherwise looks like a bot pattern. This happened for real on 2026-07-27: `5.29.20.21` was correctly blocked on 2026-07-26 for a scripted admin-probe pattern, but her ISP reassigned that exact address to her the next day, and the block silently 403'd her out of her own site until it was caught and reversed. Residential IPs get reassigned; a block that looked justified yesterday can be blocking the site owner today.

3. **Classify each IP using this evidence, not gut feel:**
   - **Known legitimate crawler** — PTR resolves to `*.googlebot.com` (Google, range `66.249.66.0/24` is well-documented as Googlebot) or `*.babbar.tech`/similar documented SEO crawler. → **No action.** Blocking Google's crawler actively hurts the site's own SEO goals — flag this explicitly if the user seems inclined to block one of these.
   - **Carrier-grade NAT / mobile network** — no PTR, but the IP falls in a documented CGNAT range (e.g. `100.64.0.0/10`, or known carrier blocks like T-Mobile US `172.56.0.0/13`) — many real distinct users can share one IP. High volume alone is not suspicious here. → Usually **no action**, unless the path pattern itself looks like scanning (see below).
   - **Scanner/exploit-probe pattern** — hits paths that don't exist on this site (e.g. `/graphql`, `/wp-login.php`, `/products.json`, `/.env`, `/admin`), especially combined with high 404/502 rates and a large number of *distinct* paths relative to total requests (breadth-first probing, not repeat visits to the same few pages). → **Recommend block.**
   - **Heavy but plausible real user** — residential ISP PTR (cable/DSL/fiber provider — `*.cox.net`, `*.comcast.net`, `*.verizon.net`, UK/EU consumer ISPs, etc.), requests concentrated on real content pages and legitimate API routes the site's own frontend calls (e.g. `/api/personalized`, `/api/config/download-mode`), reasonable path diversity. → **No action.**
   - **Ambiguous** — residential/no-PTR, volume is elevated but the path pattern doesn't clearly look like scanning (e.g. suspiciously uniform repeat counts across a handful of pages, which could be a monitoring bot or a residential-proxy scraper) and there isn't enough signal to call it either way. → **Recommend watch**, not block.
   - **Repeat offender** — `IP_HISTORY` shows this IP was already blocked or watched before (regardless of whether that row has since expired) and the current evidence again supports block. → **Recommend block with `ttlDays=90`** instead of the default 30. Not a permanent block — IPs get reassigned to new owners over time (dynamic residential leases, recycled datacenter/VPS addresses), so an indefinite block eventually just penalizes whoever inherits the address. `IP_HISTORY` itself never expires, so a further repeat after the 90 days will still be recognized and can be escalated again at that point.

4. **Present the recommendation per IP** with the specific evidence that drove it (PTR result, method mix, notable status codes, the paths that matter) — don't just assert a verdict. Wait for the user to confirm before doing anything.

5. **Act only after confirmation:**
   - Block: `npm run block-ip -- <ip> "<reason>" [ttlDays=30, or 90 for a repeat offender per step 3]`
   - Watch: `npm run watch-ip -- <ip> "<reason>" [ttlDays=3]`
   - No action: nothing to run.

   Write a specific `reason` string citing the actual evidence (e.g. `"no rDNS, /graphql /products.json probing, 274x502"`), not a generic label — this reason is what a human reviewing `BLOCKED_IP`/`WATCHED_IP` later will read.

6. **Remind about timing.** A fresh block only takes effect in AWS WAF on the next daily Lambda pipeline run (the `[init]` WAF sync step in `lambda/handler.ts`), not immediately. A watch entry doesn't block anything at all — it's purely a marker for a follow-up review after `ttlDays`.

## AWS WAF Bot Control (behavioral layer, separate from IP review above)

Everything above (`BLOCKED_IP`/`WATCHED_IP`, `analyze-ip.ts`, `block-ip`/`watch-ip`) targets **specific known IPs**. It has a structural blind spot: an actor that rotates through many IPs (a botnet, a residential-proxy pool, a datacenter renting fresh addresses) never accumulates enough volume on any single IP to get caught by that workflow — it took 246+ distinct IPs from two Alibaba Cloud `/24` ranges before the pattern became visible on 2026-08-12 (see `BLOCKED_IP` entries for `43.119.100.0/24` etc.).

**AWS WAF Bot Control** (`AWSManagedRulesBotControlRuleSet`, an AWS-managed rule group) is the second, complementary layer for this — it classifies traffic by *signature/behavior* (user-agent, TLS/HTTP fingerprint, known bot categories) regardless of which IP it's coming from. It's wired into the same Web ACL as the IP blocklist:

- **Web ACL:** `CrossStitchBotProtection` (`arn:aws:wafv2:us-east-1:358174257684:regional/webacl/CrossStitchBotProtection/b6dd185d-3dac-4537-aa2f-abfd6c258676`), same ACL the `AutoBlockedIPs`/`TencentCloud-Singapore-Bots` IP-set rules attach to (priorities 1–2). Bot Control is priority 3, evaluated after the IP rules.
- **Rule name:** `BotControlCommonCount` (name is now slightly stale — it does more than count, see below — kept as-is to avoid an unnecessary rename).
- **Inspection level:** `COMMON` (the cheaper tier — signature/UA-based; `TARGETED` also exists, adds session/challenge-based ML detection at extra per-request cost, not enabled here).
- Added 2026-08-12 in pure observe mode (`OverrideAction: Count` — logged everything, blocked nothing). On 2026-08-13, after reviewing what it was actually seeing, switched to **selective enforcement**.

### Current configuration (as of 2026-08-13)

`OverrideAction: None` (each sub-rule uses its own native action) **plus** `RuleActionOverrides` forcing every sub-rule to `Count` **except** three, which are left at their native `Block`:

- `CategorySeo` — third-party SEO crawlers (Semrush, MJ12bot/Majestic, DotBot/Moz, SE Ranking's backlink crawler, Sogou, etc.) — no benefit to the site, same reasoning as blocking `5.9.120.8` (SE Ranking) via the IP workflow above.
- `CategoryAdvertising`
- `CategoryScrapingFramework`

Everything else is deliberately left in `Count` (observed, not blocked) because it contains traffic that must not be blanket-blocked — confirmed via a 3-hour sample (`GetSampledRequests`, see below) that `SignalNonBrowserUserAgent` alone (the single largest bucket, ~58% of matches) is a grab-bag including Facebook's link-preview crawler (`meta-externalagent`, needed for social share previews to render) and AI crawlers (`ClaudeBot`, `OAI-SearchBot`) — the same "don't block a legitimate traffic source" principle as never blocking Googlebot in the IP workflow above, just applied to a signature instead of an IP range.

Full list of the 24 `AWSManagedRulesBotControlRuleSet` COMMON-level sub-rules and which side of the line each landed on:

| Sub-rule | Native default | Current override |
|---|---|---|
| `CategorySeo` | Block | *(kept — native Block)* |
| `CategoryAdvertising` | Block | *(kept — native Block)* |
| `CategoryScrapingFramework` | Block | *(kept — native Block)* |
| `CategoryArchiver` | Block | → Count |
| `CategoryContentFetcher` | Block | → Count |
| `CategoryEmailClient` | Block | → Count |
| `CategoryHttpLibrary` | Block | → Count |
| `CategoryLinkChecker` | Block | → Count |
| `CategoryMiscellaneous` | Block | → Count |
| `CategoryMonitoring` | Block | → Count |
| `CategorySearchEngine` | Block | → Count |
| `CategorySecurity` | Block | → Count |
| `CategorySocialMedia` | Block | → Count (Facebook preview crawler lives here) |
| `CategoryAI` | Block | → Count (ClaudeBot, OAI-SearchBot live here) |
| `SignalAutomatedBrowser` | Block | → Count |
| `SignalKnownBotDataCenter` | Block | → Count |
| `SignalNonBrowserUserAgent` | Block | → Count (largest bucket, mixed — see above) |
| `TGT_VolumetricIpTokenAbsent` | Challenge | → Count |
| `TGT_VolumetricSession` | Captcha | → Count |
| `TGT_SignalAutomatedBrowser` | Captcha | → Count |
| `TGT_SignalBrowserInconsistency` | Captcha | → Count |
| `TGT_TokenReuseIp` | Count | Count (unchanged) |
| `TGT_ML_CoordinatedActivityMedium` | Count | Count (unchanged) |
| `TGT_ML_CoordinatedActivityHigh` | Count | Count (unchanged) |

The seven `TGT_*` rules only actually fire under `TARGETED` inspection level, which isn't enabled here (`COMMON` only) — they're inert either way, but explicitly forced to `Count` too as a safety margin in case AWS ever changes that behavior, since their native actions (`Challenge`/`Captcha`) would otherwise interrupt real visitors.

### How to check on it later

Current live config:
```
aws wafv2 get-web-acl --scope REGIONAL --region us-east-1 \
  --name CrossStitchBotProtection --id b6dd185d-3dac-4537-aa2f-abfd6c258676 \
  --query "WebACL.Rules[?Name=='BotControlCommonCount']"
```

Daily volume (how much it's matching, `CountedRequests` + `BlockedRequests` metrics, namespace `AWS/WAFV2`, dimensions `WebACL=CrossStitchBotProtection`, `Rule=BotControlCommonCount`, `Region=us-east-1`) via `aws cloudwatch get-metric-statistics`.

Breakdown of *what* it's matching (which sub-rule, real request detail — path, UA, client IP) via `aws wafv2 get-sampled-requests` with `--rule-metric-name BotControlCommonCount` — **the time window must be within the last 3 hours**, that's a hard AWS limit on sampled-request retention, so this can't be used to retroactively inspect an older day. The per-request field to group by is `RuleNameWithinRuleGroup` (e.g. `AWS#AWSManagedRulesBotControlRuleSet#CategorySeo`), not a `Labels` array (that field is present in the schema but comes back empty here).

### Cost note

`AWSManagedRulesBotControlRuleSet` is a paid AWS managed rule group (a monthly base fee plus a small per-request charge on top of ordinary WAF request pricing) — flagging since it was silently free-tier-adjacent while in Count-only mode and is now the actively-enforcing config.

## What not to do

- Don't auto-block or auto-watch without the user confirming the specific IP and action — this command is decision *support*, the human still decides.
- Don't treat high request volume alone as sufficient evidence — always weigh it against PTR record and the actual path/method pattern from `analyze-ip.ts`.
- Don't recommend blocking a confirmed Googlebot/legitimate-crawler range no matter how high its volume is.
- Don't block an IP without first checking it isn't Olga's own current public IP (step 2b) — a dynamic residential address that looked like a bot yesterday can be reassigned to her today, and a block silently locks her out of her own site with no obvious error message pointing at the cause.
