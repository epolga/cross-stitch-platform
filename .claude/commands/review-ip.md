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

2. **Check for already-known IPs first.** Before recommending anything, check whether the IP is already in `BLOCKED_IP` or `WATCHED_IP` — if there's an existing entity for it, say so and ask whether the user wants to extend/replace it rather than silently creating a duplicate entry.

3. **Classify each IP using this evidence, not gut feel:**
   - **Known legitimate crawler** — PTR resolves to `*.googlebot.com` (Google, range `66.249.66.0/24` is well-documented as Googlebot) or `*.babbar.tech`/similar documented SEO crawler. → **No action.** Blocking Google's crawler actively hurts the site's own SEO goals — flag this explicitly if the user seems inclined to block one of these.
   - **Carrier-grade NAT / mobile network** — no PTR, but the IP falls in a documented CGNAT range (e.g. `100.64.0.0/10`, or known carrier blocks like T-Mobile US `172.56.0.0/13`) — many real distinct users can share one IP. High volume alone is not suspicious here. → Usually **no action**, unless the path pattern itself looks like scanning (see below).
   - **Scanner/exploit-probe pattern** — hits paths that don't exist on this site (e.g. `/graphql`, `/wp-login.php`, `/products.json`, `/.env`, `/admin`), especially combined with high 404/502 rates and a large number of *distinct* paths relative to total requests (breadth-first probing, not repeat visits to the same few pages). → **Recommend block.**
   - **Heavy but plausible real user** — residential ISP PTR (cable/DSL/fiber provider — `*.cox.net`, `*.comcast.net`, `*.verizon.net`, UK/EU consumer ISPs, etc.), requests concentrated on real content pages and legitimate API routes the site's own frontend calls (e.g. `/api/personalized`, `/api/config/download-mode`), reasonable path diversity. → **No action.**
   - **Ambiguous** — residential/no-PTR, volume is elevated but the path pattern doesn't clearly look like scanning (e.g. suspiciously uniform repeat counts across a handful of pages, which could be a monitoring bot or a residential-proxy scraper) and there isn't enough signal to call it either way. → **Recommend watch**, not block.

4. **Present the recommendation per IP** with the specific evidence that drove it (PTR result, method mix, notable status codes, the paths that matter) — don't just assert a verdict. Wait for the user to confirm before doing anything.

5. **Act only after confirmation:**
   - Block: `npm run block-ip -- <ip> "<reason>" [ttlDays=30]`
   - Watch: `npm run watch-ip -- <ip> "<reason>" [ttlDays=3]`
   - No action: nothing to run.

   Write a specific `reason` string citing the actual evidence (e.g. `"no rDNS, /graphql /products.json probing, 274x502"`), not a generic label — this reason is what a human reviewing `BLOCKED_IP`/`WATCHED_IP` later will read.

6. **Remind about timing.** A fresh block only takes effect in AWS WAF on the next daily Lambda pipeline run (the `[init]` WAF sync step in `lambda/handler.ts`), not immediately. A watch entry doesn't block anything at all — it's purely a marker for a follow-up review after `ttlDays`.

## What not to do

- Don't auto-block or auto-watch without the user confirming the specific IP and action — this command is decision *support*, the human still decides.
- Don't treat high request volume alone as sufficient evidence — always weigh it against PTR record and the actual path/method pattern from `analyze-ip.ts`.
- Don't recommend blocking a confirmed Googlebot/legitimate-crawler range no matter how high its volume is.
