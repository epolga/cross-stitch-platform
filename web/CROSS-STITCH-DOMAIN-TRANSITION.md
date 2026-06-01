# Cross-stitch.com Transition Runbook (Website + Email) — Step by step

**Goal:** transition from `cross-stitch-pattern.net` to `cross-stitch.com` with minimal risk and clear rollback points.  
**Strategy:** do it in phases; keep both domains working in parallel; change one thing at a time.

> ✅ This plan assumes:
> - Amazon SES is used for **sending**
> - Dynadot is the **domain registrar**
> - Email **receiving is via Dynadot forwarding**
> - Gmail is used as the **single inbox**
> - Gmail replies are sent **through Amazon SES SMTP** (not Gmail servers)
> - Gmail account: **ann.logan.mail@gmail.com**

---

## 0) Before you start (10 minutes)

### 0.1 Create a rollback snapshot
Save or screenshot:
- Current DNS records (A / CNAME / MX / TXT)
- Current ALB DNS name
- Current SES identities (domains + sender emails)
- Current sender email configured in the app

### 0.2 Lower DNS TTL (recommended)
Temporarily set TTL to **300 seconds** for records you will change (MX / TXT).
You can restore TTL to 3600 later.

---

## Phase 1 — Website readiness (low risk)

### 1.1 DNS → Load Balancer
Ensure DNS for `cross-stitch.com` points to the ALB:

- `cross-stitch.com` → **A (ALIAS)** → `<ALB-DNS>`
- `www.cross-stitch.com` → **CNAME** → `<ALB-DNS>`

### 1.2 TLS / HTTPS
- ACM certificate (us-east-1) covers:
  - `cross-stitch.com`
  - `www.cross-stitch.com`
  - `cross-stitch-pattern.net`
  - `www.cross-stitch-pattern.net`
- ALB HTTPS listener policy:
  - `ELBSecurityPolicy-TLS13-1-2-2021-06`
- HTTP (80) redirects to HTTPS (443)

### 1.3 Verify
Open in browser:
- https://cross-stitch.com
- https://www.cross-stitch.com

No warnings, no errors.

Rollback: revert DNS ALIAS/CNAME if needed.

---

## Phase 3 — Gmail inbox (already created)

- Primary inbox:
  - **ann.logan.mail@gmail.com**
- 2FA enabled
- Recovery email and phone configured

---

## Phase 4 — Email receiving (Dynadot → Gmail)

### 4.1 Enable email forwarding in Dynadot

In Dynadot:
1. Go to **My Domains → cross-stitch.com**
2. Open **Email → Email Forwarding**
3. Enable forwarding
4. Create aliases:
   - `support@cross-stitch.com` → `ann.logan.mail@gmail.com`
   - `info@cross-stitch.com` → `ann.logan.mail@gmail.com`
5. Apply changes

---

## Phase 5 — Email sending from domain using Amazon SES

### 5.1 Verify domain in SES (us-east-1)

In Amazon SES:
1. Add identity → **Domain** → `cross-stitch.com`
2. Add provided DNS records:
   - DKIM CNAMEs (3 records)
   - Verification TXT (if provided)
3. Wait for SES to mark domain as **Verified**

---

## Phase 6 — Configure Gmail “Send mail as” via SES SMTP

In Gmail (logged in as **ann.logan.mail@gmail.com**):
- Settings → Accounts and Import
- Add `support@cross-stitch.com`
- SMTP: `email-smtp.us-east-1.amazonaws.com`
- Port 587 / TLS enabled

---

## Final checklist

- [ ] Website HTTPS OK
- [ ] Email forwarding works
- [ ] SES DKIM/SPF/DMARC pass
- [ ] Gmail sends via SES SMTP
