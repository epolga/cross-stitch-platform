# Pinterest AI Agent — API Integrations

## Purpose

This document extracts and centralizes all API-related architecture and implementation details from the original master planning document.

This includes:

* OAuth flows

* token lifecycle management

* API providers

* scopes

* authentication architecture

* refresh-token strategy

* service separation

---

# Current Integrated APIs

## Google APIs

### Current integrations

* Google OAuth

* GA4 Data API

* AdSense Management API

### Current status

```text

Working

```

### Authentication model

OAuth Desktop Application.

### Important understanding

Google OAuth testing mode is acceptable for the current private/internal tool architecture.

### Current stored credentials

```text

Client ID

Client Secret

Refresh Token

```

### Important operational understanding

```text

Google OAuth app testing mode does NOT mean fake/test data.

Real production analytics data is still used.

```

---

## Pinterest APIs

### Current integrations

* Pinterest Ads API

* Pinterest OAuth

* Pinterest metrics reporting

### Current scopes

```text

ads:read

boards:read

boards:write

pins:read

pins:write

```

### Verified working access

```text

Ad Account ID: 549769986352

Name: Cross Stitch Patterns

```

### Existing uploader integration

Existing WPF uploader already contains:

* OAuth refresh logic

* token persistence

* pin publishing

* board management

---

## AWS DynamoDB

### Current integration

* Read-only access to `CrossStitchItems` (designs + albums) via scoped IAM user

### Current scopes

```text

dynamodb:GetItem
dynamodb:BatchGetItem
dynamodb:Query
dynamodb:Scan
dynamodb:DescribeTable
dynamodb:ListTables

```

### Authentication model

Long-lived programmatic access keys stored in `automation/pinterest-agent/.env` under `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`.

### Purpose

Source of truth for the design ↔ pin map. `export-design-pin-map.ts` scans the table and surfaces every design that has a `PinterestPinId` attribute, plus the album captions used as temporary themes.

### Planned production migration

A future AWS-deployed agent should access DynamoDB through an IAM role attached to its Lambda execution context, not through long-lived access keys.

---

## Anthropic API

### Current integration

* Claude Sonnet reasoning layer

* AI recommendation generation

* AI design analysis (themes/styles/albums)

### Current model

```text

claude-sonnet-4-6

```

### Current usage

* business analysis

* profitability interpretation

* operational recommendations

* strategic reasoning

### Important understanding

The AI model itself runs on Anthropic infrastructure.

The local project code only:

```text

builds prompts

sends HTTPS requests

receives AI responses

```

---

# OAuth Architecture Understanding

## Important distinction

```text

Secrets Manager stores credentials.

It does NOT refresh OAuth tokens automatically.

```

Therefore:

```text

credential storage

≠

OAuth lifecycle management

```

---

# Current Token Strategy

## Current stage

Development/testing stage currently uses:

```text

.env-based local credentials

```

---

## Planned future stage

Production architecture should migrate credentials into:

```text

AWS Secrets Manager

```

---

# Planned Production OAuth Flow

Recommended future production flow:

```text

Lambda starts

↓

Read credentials from Secrets Manager

↓

Check token expiration

↓

Refresh token if necessary

↓

Persist updated credentials

↓

Continue API operations

```

---

# Future Planned APIs

## Meta / Facebook / Instagram

Planned future uses:

* ad analytics

* campaign management

* cross-platform profitability analysis

---

## Reddit

Planned future uses:

* campaign analytics

* subreddit targeting

* niche audience discovery

---

## Google Ads

Planned future uses:

* keyword campaigns

* ROI comparison

* cross-platform optimization

---

# Important Strategic Understanding

The project is evolving toward:

```text

unified multi-platform marketing intelligence

```

rather than isolated single-platform automation.

