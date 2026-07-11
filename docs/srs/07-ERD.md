# Entity-Relationship Diagram — cross-stitch-platform

**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Important caveat

AWS DynamoDB does not enforce foreign keys, referential integrity, or joins. Every
relationship shown below is a **conceptual/application-level** relationship — one item
storing an identifier that another item's key happens to match — not a database
constraint. Nothing here is enforced by the data store; it is enforced (inconsistently, per
`05-SAD.md` §5.2) by application code. Cardinalities describe intended usage, not a
guarantee.

Two separate diagrams are given because the platform has two largely disconnected data
domains sharing only one cross-reference point (Design ↔ DesignPinMap/DesignPerformance,
noted in §4): the **catalog/engagement domain** (`CrossStitchItems`, `CrossStitchUsers`, and
the newer per-feature tables — written by the Website, Uploader, and autopinner) and the
**business-history domain** (`CrossStitchBusinessHistory` — owned exclusively by
pinterest-agent).

## 2. Catalog & engagement domain

```mermaid
erDiagram
    ALBUM ||--o{ DESIGN : "contains (AlbumID)"
    DESIGN ||--o{ DESIGN_LIKE : "voted on (designId)"
    DESIGN ||--o| PIN_UPLOAD : "created by (design row also carries its own pin fields)"
    USER ||--o{ SAVED_PATTERN : "owns (ownerID)"
    USER ||--o{ SUBSCRIPTION_EVENT : "subject of (UserId / Email)"
    USER ||--o| PASSWORD_RESET_TOKEN : "requested (Email — not a DDB-enforced FK; PK is Token)"
    USER ||--o{ FEATURE_REQUEST : "submitted (userId, optional — anonymous allowed)"
    USER ||--o{ DESIGN_LIKE : "cast (identified by email, loosely — anonymous/IP fallback exists)"
    USER ||--o{ EDITOR_EVENT : "generated (sessionId, not directly userId — see note)"
    LEGACY_USER ||--o| USER : "same person, UNRECONCILED (see 05-SAD.md §5.2 item 2)"
    SAVED_PATTERN ||--o{ EDITOR_EVENT : "referenced by (patternId, loosely)"

    ALBUM {
        string ID PK "ALB#<albumId:D4>"
        string NPage SK "00000 sentinel"
        number AlbumID
        string Caption
    }
    DESIGN {
        string ID PK "ALB#<albumId:D4>, shared PK with parent ALBUM"
        string NPage SK "zero-padded page number"
        number DesignID
        number AlbumID FK
        string Caption
        string Description
        string Notes
        number NColors
        number Width
        number Height
        number NDownloaded
        number NGlobalPage
        string PinID "+5 legacy spellings, see 00-Overview.md §5"
        string SeoTitle
        string SeoDescription
    }
    USER {
        string ID PK
        string Email
        string FirstName
        string Password "PLAINTEXT — see 01-SRS-Website.md NFR-7"
        bool ReceiveUpdates
        string UnsubscribeToken
        bool Verified
        string SubscriptionId
        bool SubscriptionActive
        string TrialEndsAt
        number TrialDownloadsUsed
        bool BotSuspect
    }
    LEGACY_USER {
        string ID PK "USR#<email>"
        string OpenPwd "PLAINTEXT, legacy field"
        string cid
        bool Unsubscribed
    }
    PASSWORD_RESET_TOKEN {
        string Token PK
        string Email
        number ExpiresAtEpoch "default +7200s"
    }
    SUBSCRIPTION_EVENT {
        string ID PK "SEVT#<iso>#<uuid>"
        string SubscriptionId
        string UserId FK
        string Email
        string EventType
        string Status
    }
    DESIGN_LIKE {
        string designId FK
        string email_or_identifier
        string direction "up | down"
    }
    SAVED_PATTERN {
        string id PK "uuid"
        string ownerID FK
        string name
        number width
        number height
        string grid "RLE-encoded, 350KB cap"
        array hiddenColors
    }
    FEATURE_REQUEST {
        string id PK
        string userId FK "optional"
        string text
        string importance
        string status
        number patternWidth "editor-context, optional"
        number editorTimeSeconds "optional"
    }
    EDITOR_EVENT {
        string eventType
        string sessionId "not a DB entity — client-generated"
        string patternId FK "optional, loose"
        string entrySource
    }
    PIN_UPLOAD {
        string note "not a separate table — DESIGN.PinID *is* the pin reference"
    }
```

**Notes on this diagram:**
- `DESIGN` and `ALBUM` share the same physical table (`CrossStitchItems`) and even the same
  partition key pattern (`ALB#<albumId:D4>`) — `ALBUM`'s row is the `NPage="00000"` sentinel
  within the same partition as its designs. This is why they're drawn with a strong
  containment relationship rather than a loose foreign key.
- `DESIGN_LIKE`, `SAVED_PATTERN`, `FEATURE_REQUEST`, `EDITOR_EVENT`, and blog reactions
  (not shown — keyed by post `slug`, a static content identifier, not a database entity)
  each live in their own DynamoDB table, per `01-LLD-Website.md` §2.5 — not formally
  documented in `docs/integration/dynamodb-schema.md` at the time this ERD was drawn.
  `DESIGN_LIKE`'s table is confirmed named `CrossStitchLikes` (per
  `06-API-Specification.md` §3); the others' exact table names should be confirmed against
  the live DynamoDB console before treating this ERD as authoritative for anything beyond
  the conceptual relationships shown.
- `USER` ↔ `LEGACY_USER` is drawn as "unreconciled" deliberately — there is no code path
  that guarantees these two records for the same real person stay in sync, and some
  operations (e.g. the Uploader's cid/unsubscribe back-fill helpers) touch only the legacy
  row.
- `DESIGN_LIKE.email_or_identifier` reflects that vote identity is resolved from an email
  parameter (query/body/header), **not** cryptographically tied to the session — see
  `06-API-Specification.md` §3 auth footnote.

## 3. Business-history domain (pinterest-agent's own table, `CrossStitchBusinessHistory`)

```mermaid
erDiagram
    DAILY_BUSINESS ||--o{ ANOMALY_EVENT : "source metric for"
    DAILY_BUSINESS ||--o{ AI_ANALYSIS : "input to (trend type)"
    PROMOTED_AD_STATS ||--o{ PIN_ATTRIBUTION : "input to"
    LANDING_PAGE_STATS ||--o{ PIN_ATTRIBUTION : "input to"
    DESIGN_PIN_MAP }o--|| DESIGN : "designId — CROSS-TABLE reference into CrossStitchItems"
    DESIGN_PERFORMANCE }o--|| DESIGN : "designId — CROSS-TABLE reference into CrossStitchItems"
    BLOCKED_IP ||--o{ IP_HISTORY : "one active record; history is permanent"
    WATCHED_IP ||--o{ IP_HISTORY : "one active record; history is permanent"

    DAILY_BUSINESS {
        string EntityType PK "DAILY_BUSINESS"
        string SortKey SK "date, e.g. 2026-07-11"
        number spend
        number adsenseRevenue
        number ga4TotalAllSessions
        number profit
    }
    AI_ANALYSIS {
        string SortKey SK "generatedAt#type"
        string analysisType "trend | design"
        string recommendedAction "trend only"
        string markdownS3Key
    }
    ANOMALY_EVENT {
        string SortKey SK "detectedAt#metric"
        string metric
        bool notified
    }
    PROMOTED_AD_STATS {
        string SortKey SK "date#adId"
        number spend
        number impressions
    }
    LANDING_PAGE_STATS {
        string SortKey SK "date#page"
        number sessions
    }
    PIN_ATTRIBUTION {
        string SortKey SK "date#adId"
        number attributedRevenue
        number profit
    }
    DESIGN_PIN_MAP {
        string SortKey SK "designId, 5-digit padded"
        string pinId
    }
    DESIGN_PERFORMANCE {
        string SortKey SK "snapshotDate#designId"
        number savesPerDay
        number impressionsPerDay
    }
    PINTEREST_TOKEN {
        string SortKey SK "CURRENT (singleton)"
        string access_token
        string expires_at_utc
    }
    BLOCKED_IP {
        string SortKey SK "ip"
        string reason
        number ttl "native DDB TTL, ~30d default"
    }
    WATCHED_IP {
        string SortKey SK "ip"
        string reason
        number ttl "native DDB TTL, ~3d default"
    }
    IP_HISTORY {
        string SortKey SK "ip#at"
        string action "blocked | watched"
        string reason
    }
```

**Notes on this diagram:**
- All eleven entity types share one physical table (`EntityType`/`SortKey` single-table
  design) — the entity boxes above are logical, not twelve separate tables.
- `DESIGN_PIN_MAP` and `DESIGN_PERFORMANCE` are the **only** places this table references
  data owned by a different table (`CrossStitchItems`, in the other domain) — a genuine
  cross-database logical relationship, unenforced, that both readers and writers must keep
  consistent by convention alone.
- `PINTEREST_TOKEN` is a true singleton (fixed sort key `"CURRENT"`) with no relationships
  to anything else.
- `IP_HISTORY` deliberately has **no TTL** while `BLOCKED_IP`/`WATCHED_IP` both do — this
  asymmetry is the entire mechanism behind repeat-offender recognition
  (`03-LLD-Pinterest-Automation.md` §4).

## 4. Cross-domain reference summary

| From (business-history domain) | To (catalog domain) | Reference field | Enforced? |
|---|---|---|---|
| `DESIGN_PIN_MAP` | `DESIGN` | `designId` ↔ `DesignID` | No — application convention only |
| `DESIGN_PERFORMANCE` | `DESIGN` | `designId` ↔ `DesignID` | No — application convention only |

No other cross-table/cross-domain references exist. This is a deliberately thin seam: the
business-history domain is otherwise self-contained, so pinterest-agent's reporting
pipeline can run without needing transactional consistency with the catalog table it
occasionally reads design IDs from.
