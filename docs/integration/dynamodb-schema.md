# DynamoDB schema — CrossStitchItems and CrossStitchUsers

## 1. Contract Name

**DynamoDB schema — `CrossStitchItems` and `CrossStitchUsers`** (single-table catalog plus secondary users table, shared between the WPF `Uploader` writer and the `cross-stitch` Next.js reader).

This contract is the densest in the repo because:

1. The schema lives **only** in `d:/ann/Git/cross-stitch/TableDescription.txt:1` (a raw `aws dynamodb describe-table` dump) — there is no source-of-truth document anywhere else.
2. The two repos write/read with **different attribute name conventions** (e.g. Pinterest pin-ID has six historical spellings, see §4).
3. The CLAUDE.md "do-not-invent" rule applies here: every attribute below is observed in actual code or in `TableDescription.txt`.

## 2. Purpose

Persist the cross-stitch catalog (`ALBUM` containers, `DESIGN` patterns) and the user/account records (`USR#<email>`) in a single shared DynamoDB table (`CrossStitchItems`), plus a secondary "clean" users table (`CrossStitchUsers`) introduced for the Next.js site's auth flows (registration, password reset, subscriptions, trial entitlements).

- **Producer (writer):** WPF `Uploader` — `MainWindow.xaml.cs InsertItemIntoDynamoDbAsync` (`d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:1057-1090`) is the canonical `DESIGN` item writer; `Uploader/Helpers/PinterestBoardCreator.cs:110-160` reads `ALBUM` items only.
- **Consumer (reader):** `cross-stitch` Next.js app — `src/lib/data-access.ts:115-238` (cache of `DESIGN` + `ALBUM`), `src/lib/users.ts:292-377` (writes `CrossStitchUsers` on registration), `src/lib/password-reset.ts:31-167` (reads/writes `CrossStitchUsers` plus `PasswordResetTokens`).

## 3. Scope

In scope:

- Two tables: `CrossStitchItems` and `CrossStitchUsers` (both in `us-east-1`, `account 358174257684`, per `d:/ann/Git/cross-stitch/TableDescription.txt:45`).
- All attributes observed in the writer (`Uploader`) and reader (`cross-stitch`) code paths.
- The three GSIs on `CrossStitchItems`: `Designs-index`, `DesignsByID-index`, `ID-DesignID-index` (`d:/ann/Git/cross-stitch/TableDescription.txt:51-141`).
- The `USR#`-prefixed user records that co-habit `CrossStitchItems` (legacy users) plus the parallel records in `CrossStitchUsers` (post-Next.js users).

Out of scope:

- Stripe/PayPal payloads or any non-DynamoDB stores.

Also covered (added 2026-07-25, live-verified against AWS — see §4.9-4.14): six further tables that exist in code but weren't previously in this contract — `ConverterPatterns`, `CrossStitchLikes`, `FeatureRequests`, `CrossStitchBlogReactions`, `EditorEvents`, `SearchQueries` — plus the two originally out-of-scope auxiliary tables `PasswordResetTokens` (§4.7) and `SubscriptionEvents` (§4.8).

## 4. Data Formats

### 4.1 `CrossStitchItems` — key schema and indexes

From `d:/ann/Git/cross-stitch/TableDescription.txt:25-141`:

| Element            | Attribute      | Type | Notes                                                                                  |
| ------------------ | -------------- | ---- | -------------------------------------------------------------------------------------- |
| Table              | `CrossStitchItems` |  | `TableDescription.txt:25`                                                              |
| Partition key (PK) | `ID`           | S    | `TableDescription.txt:13-15, 28-30`                                                    |
| Sort key (SK)      | `NPage`        | S    | `TableDescription.txt:20-23, 31-34` (sort key is `S`, **not** `N`, even though it holds digits) |
| GSI `Designs-index`     | PK `EntityType` (S) / SK `NGlobalPage` (N) | | `TableDescription.txt:52-63`                |
| GSI `DesignsByID-index` | PK `EntityType` (S) / SK `DesignID` (N)    | | `TableDescription.txt:82-95`                |
| GSI `ID-DesignID-index` | PK `ID` (S) / SK `DesignID` (N)            | | `TableDescription.txt:112-126`              |
| Billing            | `PAY_PER_REQUEST` |   | `TableDescription.txt:47-50`                                                          |
| ItemCount          | 71 691         |      | `TableDescription.txt:44`                                                              |

The `EntityType` discriminator partitions the rows into logical entities. Three values are observed in code: `"DESIGN"`, `"ALBUM"`, `"USER"`.

### 4.2 `EntityType = "DESIGN"` — pattern row

`ID` pattern: `ALB#<albumId:D4>` (e.g. `ALB#0027`). Source: `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:107` (`AlbumPartitionKey = $"ALB#{albumId:D4}";`) and `d:/ann/Git/cross-stitch/src/lib/data-access.ts:271` (`const partitionKey = \`ALB#${paddedAlbumId}\`;`).

`NPage` pattern: zero-padded 5-digit string (`"00001"`, `"00002"`, …) computed via `(maxNPage + 1).ToString("D5")` in `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:830`. The album row itself uses sentinel `"00000"` (`d:/ann/Git/cross-stitch/src/lib/data-access.ts:278`).

| Attribute     | DDB type | Required? | Written by                                                                    | Read by                                                                                       | Default                                | Notes                                                                                                                            |
| ------------- | -------- | --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ID`          | S        | required  | `MainWindow.xaml.cs:1067`                                                     | `data-access.ts:176` (cached), `data-access.ts:629`                                            | `ALB#{albumId:D4}`                     | PK; also reused as the PK for album rows.                                                                                        |
| `NPage`       | S        | required  | `MainWindow.xaml.cs:1068`                                                     | `data-access.ts:152, 179, 275-279`                                                            | `(maxNPage+1).ToString("D5")`          | SK is `S`, even though numeric.                                                                                                  |
| `AlbumID`     | N        | required  | `MainWindow.xaml.cs:1069`                                                     | `data-access.ts:143, 210, 154`                                                                | `_albumId`                             | Redundant with `ID`; used by reader to build CloudFront URLs without parsing the PK.                                             |
| `DesignID`    | N        | required  | `MainWindow.xaml.cs:1072`                                                     | `data-access.ts:142`, `MainWindow.xaml.cs:851-853`                                            | `PatternInfo.DesignID`                 | Also listed in `AttributeDefinitions` (`TableDescription.txt:5-7`) because it is a GSI SK on `DesignsByID-index` and `ID-DesignID-index`. |
| `EntityType`  | S        | required  | `MainWindow.xaml.cs:1073`                                                     | `data-access.ts:122-125, 191-194`, `PinterestBoardCreator.cs:119-122`                          | `"DESIGN"`                             | GSI partition key for `Designs-index` and `DesignsByID-index`.                                                                   |
| `Caption`     | S        | required  | `MainWindow.xaml.cs:1070`                                                     | `data-access.ts:144`, `PinterestBoardCreator.cs:146`                                          | `PatternInfo.Title`                    | Used as both display title and URL slug (`url-helper.ts CreateDesignUrl`).                                                       |
| `Description` | S        | required  | `MainWindow.xaml.cs:1071`                                                     | `data-access.ts:145`                                                                          | `PatternInfo.Description`              | E.g. `"100 x 120 stitches 25 colors"` (`d:/ann/Git/Uploader/Uploader/PatternInfo.cs:128`).                                       |
| `Notes`       | S        | required  | `MainWindow.xaml.cs:1078`                                                     | `data-access.ts:150`                                                                          | `PatternInfo.Notes`                    | HTML-like `<br />`-separated lines extracted from the PDF (`PatternInfo.cs:172-223`).                                            |
| `NColors`     | N        | required  | `MainWindow.xaml.cs:1075`                                                     | `data-access.ts:147`                                                                          | `PatternInfo.NColors`                  |                                                                                                                                  |
| `Width`       | N        | required  | `MainWindow.xaml.cs:1079`                                                     | `data-access.ts:148`                                                                          | `PatternInfo.Width`                    |                                                                                                                                  |
| `Height`      | N        | required  | `MainWindow.xaml.cs:1074`                                                     | `data-access.ts:149`                                                                          | `PatternInfo.Height`                   |                                                                                                                                  |
| `NDownloaded` | N        | required  | `MainWindow.xaml.cs:1076`                                                     | `data-access.ts:146, 632-637`                                                                 | `"0"` on insert; incremented by reader | Reader uses `UpdateExpression: SET NDownloaded = if_not_exists(NDownloaded, :zero) + :inc` (`data-access.ts:632`).               |
| `NGlobalPage` | N        | required  | `MainWindow.xaml.cs:1077`                                                     | `data-access.ts:172`, `MainWindow.xaml.cs:792, 799`                                            | `(maxGlobalPage + 1)`                  | GSI SK on `Designs-index`; computed by `GetMaxGlobalPageAsync` (`MainWindow.xaml.cs:779-803`).                                   |
| `PinID`       | S        | required (post-Pinterest integration) | `MainWindow.xaml.cs:1062-1063, 1080` (throws if missing) | `MainWindow.xaml.cs:872, 890`, `export-design-pin-map.ts:49` (defensive)                  | `PatternInfo.PinId`                    | **DRIFT** — see §4.4 below.                                                                                                      |
| `Text`        | S        | optional (legacy; never written today) | none in current writer                                       | `data-access.ts:151` (`item.Text?.S \|\| ""`)                                                | n/a                                    | Reader tolerates absence.                                                                                                        |
| `ImageUrl`    | S        | optional  | none — reader synthesizes from `AlbumID/DesignID`                              | `data-access.ts:153-155`                                                                      | n/a                                    | If absent, reader builds `https://d2o1uvvg91z7o4.cloudfront.net/photos/{AlbumID}/{DesignID}/4.jpg`.                              |
| `CanonicalDesignId` | N  | optional (added 2026-07-25) | `automation/pinterest-agent/scripts/set-canonical-design.ts` / `apply-confirmed-canonicals.ts` (batch tool, not the web app) | `data-access.ts:204`, `web/src/app/designs/[designId]/page.tsx:93-98` | n/a | Points a near-duplicate design at the DesignID of the primary design it should canonicalize to for SEO (`<link rel="canonical">` target only — the page itself still renders/serves normally, `robots` unchanged). Set on 43 designs 2026-07-25 (39 confirmed-byte-identical duplicate clusters found via `find-duplicate-designs.ts` + `verify-duplicate-designs-visual.ts`) — see `docs/Focus.md` Pending #13, Gap 3. |
| `SeoSubjectBlurb` | S | optional (added 2026-07-25) | `automation/pinterest-agent/scripts/backfill-visual-seo.ts` | `data-access.ts:205`, `web/src/app/designs/[designId]/page.tsx` ("Did you know?" block) | n/a | Vision-generated short fact/story about the design's actual subject; falls back to a fixed generic paragraph when absent. |
| `LastModifiedAt` | S | optional (added 2026-07-25) | Any script that writes design content: `backfill-visual-seo.ts`, `set-canonical-design.ts`, `apply-confirmed-canonicals.ts` | `data-access.ts:206`, `web/src/app/sitemap.xml/route.ts` (`<lastmod>`) | n/a | Real per-row content-change timestamp (ISO string) — replaces the old bug where the sitemap stamped every URL with `new Date()` on every hourly regeneration regardless of whether anything changed, which made `<lastmod>` meaningless to Google. One-off retroactive backfill (`scripts/_backfill_last_modified_at.ts`, 2026-07-25) copied the existing `SeoTitleUpdatedAt` value into this field for the ~5260 designs already touched by today's visual-SEO backfill. Any *future* write path that changes a design's rendered content must also set this field, or that change won't show up in the sitemap's `<lastmod>`. |

The writer hard-codes the column list — there is no schema validation step. Any new attribute requires patching both `InsertItemIntoDynamoDbAsync` (`MainWindow.xaml.cs:1065-1081`) and the reader projection (`data-access.ts:141-173`).

### 4.3 `EntityType = "ALBUM"` — album row

`ID` pattern: same `ALB#<albumId:D4>` PK as design rows, but with sentinel `NPage = "00000"`.

| Attribute    | DDB type | Required? | Written by | Read by                                                                              | Notes                                                                                  |
| ------------ | -------- | --------- | ---------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `ID`         | S        | required  | (manual / not in current writer code path) | `PinterestBoardCreator.cs:138-141`, `data-access.ts:284`                              | `ALB#0001` style.                                                                       |
| `NPage`      | S        | required  | (manual)   | `data-access.ts:278` (queried with `:nPage = "00000"`)                                | Sentinel `"00000"`.                                                                    |
| `AlbumID`    | N        | required  | (manual)   | `data-access.ts:210`, `export-design-pin-map.ts:87`                                  |                                                                                        |
| `Caption`    | S        | required  | (manual)   | `data-access.ts:211, 292`, `PinterestBoardCreator.cs:146`                            |                                                                                        |
| `EntityType` | S        | required  | (manual)   | `data-access.ts:191-194`, `PinterestBoardCreator.cs:119-122`                          | Value `"ALBUM"`.                                                                       |

Note: no current code path in `Uploader` *creates* `ALBUM` rows; the writer only inserts `DESIGN` rows for an album whose `ALB#` partition already exists. Albums are seeded manually (or by older tooling not in the current repo).

### 4.4 Pinterest pin-ID attribute-name **drift** (six spellings observed)

The reader at `d:/ann/Git/cross-stitch/src/lib/data-access.ts:157-164` and `d:/ann/Git/cross-stitch/automation/pinterest-agent/scripts/export-design-pin-map.ts:43-52` defensively probes six historical attribute names:

```ts
PinterestPinId: 
  readOptionalAttributeString(item.PinterestPinId) ||  // data-access.ts:158
  readOptionalAttributeString(item.PinterestPinID) ||  // data-access.ts:159
  readOptionalAttributeString(item.PinterestID)   ||  // data-access.ts:160
  readOptionalAttributeString(item.PinterestId)   ||  // data-access.ts:161
  readOptionalAttributeString(item.PinID)         ||  // data-access.ts:162  ← what Uploader writes today
  readOptionalAttributeString(item.PinId)         ||  // data-access.ts:163
  null,
```

Today the only writer is `Uploader`, and it writes `"PinID"` (`d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:1080`). The `PatternInfo` class exposes both a `PinId` C# property (line 43-47) **and** a `PinID` C# property (line 100-104) backed by the same `_pinId` field — strong evidence of past renaming. Reader-side comment confirms the intent: `// Pin IDs are stored under several historical attribute names — see src/lib/data-access.ts` (`export-design-pin-map.ts:42`).

A parallel drift exists for the pin URL: `PinterestPinUrl / PinterestPinURL / PinterestUrl / PinUrl / PinURL` (`data-access.ts:166-171`). The current writer does **not** write any of these, so all five are read as `null`.

### 4.5 `EntityType = "USER"` rows inside `CrossStitchItems` (legacy)

Older user records live inside `CrossStitchItems` with `ID = USR#<email>`. The Next.js login flow checks this table **first** (`d:/ann/Git/cross-stitch/src/lib/data-access.ts:654-707`).

| Attribute      | DDB type | Required? | Written by                                                                  | Read by                                                                                  | Notes                                                                                          |
| -------------- | -------- | --------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ID`           | S        | required  | (manual; legacy)                                                            | `data-access.ts:654-666`                                                                 | `USR#<email>`.                                                                                 |
| `NPage`        | S        | required  | (legacy)                                                                    | `MainWindow.xaml.cs:1461-1466, 1481-1485, 3020`                                          | Required by Uploader's cid back-fill because PK alone is not unique key.                       |
| `EntityType`   | S        | optional  | (legacy)                                                                    | `data-access.ts:783-789` (`:user = "USER"`)                                              | Value `"USER"`.                                                                                |
| `OpenPwd`      | S        | required for legacy login | (legacy)                                                    | `data-access.ts:684-695`                                                                 | Plaintext password (legacy).                                                                   |
| `FName` / `FirstName` / `UserName` | S | optional | (legacy)                                                  | `data-access.ts:700` (`FName?.S \|\| FirstName?.S \|\| UserName?.S`)                     | Three historical spellings.                                                                    |
| `cid`          | S        | optional → required (back-filled) | `MainWindow.xaml.cs:1486-1490` (`SET cid = :cid`)            | `data-access.ts:783-799`                                                                 | Lowercase `cid` — see §4.7. Uploader back-fills missing values.                                |
| `Email`        | S        | optional  | (legacy)                                                                    | `data-access.ts:78`                                                                      |                                                                                                |
| `LastEmailEntry` | S      | optional  | `data-access.ts:803-810`                                                    | `MainWindow.xaml.cs:1906`                                                                | ISO-8601 set when notification email is sent to user.                                          |
| `Unsubscribed` | BOOL     | optional → back-filled to `false` | `MainWindow.xaml.cs:1336-1340`                            | `users.ts:1309, 1320`                                                                    |                                                                                                |
| `UnsubscribeToken` | S    | optional → back-filled            | `MainWindow.xaml.cs:1327-1331`                            | `users.ts:1244, 1257`                                                                    |                                                                                                |

### 4.6 `CrossStitchUsers` — secondary users table

Table name resolved from env var `DDB_USERS_TABLE` (default `"CrossStitchUsers"`) in `d:/ann/Git/cross-stitch/src/lib/users.ts:16`. Uploader resolves from `App.config` key `UsersTableName` (default `"CrossStitchUsers"`) in `d:/ann/Git/Uploader/Uploader/App.config:7` and `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:702, 1277, 1421, 1746, 2129, 2254, 3074, 3194`.

Key schema is **PK `ID` only** — the table has no SK (inferred from the GetItem/UpdateItem calls in `users.ts:233-239` and `password-reset.ts:36-44` that supply only `ID`). This is **different from `CrossStitchItems`** which has both `ID` and `NPage`.

| Attribute                 | DDB type | Required? | Written by                                                       | Read by                                                                           | Notes                                                                                                                            |
| ------------------------- | -------- | --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ID`                      | S        | required  | `users.ts:314, 322`                                              | `users.ts:236, 322, 587`, `password-reset.ts:39, 156`                              | PK; format `USR#<email>` (or `TST#<email><epoch>` for test users — `data-access.ts:740`).                                        |
| `Email`                   | S        | required  | `users.ts:323`                                                   | `users.ts:78, 167, 252`                                                           | Lowercased and trimmed via `normalizeEmail` (`users.ts:125`).                                                                     |
| `FirstName`               | S        | required  | `users.ts:324`                                                   | `users.ts:167, 700`                                                               | Reader also tolerates legacy `FName` and `UserName` as fallback (`data-access.ts:700`).                                          |
| `Password`                | S        | required  | `users.ts:325`                                                   | `users.ts:68, 159`, `password-reset.ts:157-162`                                   | **Stored in plaintext** (comment at `users.ts:325`: "Storing plain password for migration purposes"). See §10.                   |
| `CreatedAt`               | S        | required  | `users.ts:326`                                                   | `MainWindow.xaml.cs:3077, 3121, 3138`                                              | ISO-8601 (`new Date().toISOString()`).                                                                                            |
| `ReceiveUpdates`          | BOOL     | required  | `users.ts:327`                                                   | (not currently read; written only)                                                | Defaults to `true` (`users.ts:300-301`).                                                                                          |
| `UnsubscribeToken`        | S        | required  | `users.ts:328`                                                   | `users.ts:1244, 1257`, `MainWindow.xaml.cs:2256, 2261`                            | `randomUUID()` (`users.ts:302`).                                                                                                  |
| `Unsubscribed`            | BOOL     | required  | `users.ts:329`                                                   | `users.ts:1309, 1320`                                                              | Defaults to `false`.                                                                                                              |
| `cid`                     | S        | required  | `users.ts:330` (lowercase `cid`)                                 | `users.ts:402, 466, 558`, `data-access.ts:782-799`, `MainWindow.xaml.cs:1419-1494` | Lowercase **on purpose** (`users.ts:330`) — back-filled by Uploader (`MainWindow.xaml.cs:1486-1490`) for legacy rows.            |
| `VerificationToken`       | S        | required  | `users.ts:331`                                                   | `users.ts:462-466`                                                                | Cleared by `verifyUserByToken` via `REMOVE #token` (`users.ts:517-518`).                                                          |
| `VerificationTokenExpiresAt` | S    | required  | `users.ts:332`                                                   | `users.ts:466, 491`                                                                | 48h default (`users.ts:307`).                                                                                                     |
| `Verified`                | BOOL     | required  | `users.ts:333`                                                   | `users.ts:428, 502`, `MainWindow.xaml.cs:3112, 3137`                              | Defaults to `false`. Back-filled `true` by Uploader's `MarkUsersVerifiedAsync` (`MainWindow.xaml.cs:3072-3190`).                  |
| `VerifiedAt`              | S        | required  | `users.ts:334` (empty string `""` until verified)                | `users.ts:429, 519`, `MainWindow.xaml.cs:3076, 3113`                              | Set to ISO-8601 on verification (`users.ts:511`).                                                                                 |
| `UserName`                | S        | optional  | `users.ts:351` (only if provided)                                | `data-access.ts:83, 700`                                                          |                                                                                                                                  |
| `SubscriptionId`          | S        | optional  | `users.ts:345`                                                   | `users.ts:168, 779-781, 992`                                                       | PayPal subscription ID.                                                                                                           |
| `SubscriptionActive`      | BOOL     | optional  | `users.ts:346`                                                   | `users.ts:170, 789, 969`                                                          |                                                                                                                                  |
| `SubscriptionStartedAt`   | S        | optional  | `users.ts:347`                                                   | `users.ts:170, 790`, `MainWindow.xaml.cs:3195, 3238`                              | ISO-8601 on subscription start.                                                                                                   |
| `SubscriptionStatusUpdatedAt` | S    | optional  | `users.ts:1001`                                                  | (write-only audit)                                                                | Set when subscription state flips via webhook.                                                                                    |
| `TrialStartedAt`          | S        | optional  | `users.ts:338, 791, 917`                                         | `users.ts:170, 791, 919`                                                          | ISO-8601.                                                                                                                         |
| `TrialEndsAt`             | S        | optional  | `users.ts:339, 917`                                              | `users.ts:171, 1174`                                                              | ISO-8601 = `TrialStartedAt + TRIAL_DURATION_DAYS` (`users.ts:319`).                                                              |
| `TrialDownloadLimit`      | N        | optional  | `users.ts:340, 917`                                              | `users.ts:151, 1178`                                                              | Default `10` (`users.ts:72`).                                                                                                     |
| `TrialDownloadsUsed`      | N        | optional  | `users.ts:341`, incremented at `users.ts:1172`                   | `users.ts:158, 1164`                                                              | Default `0`.                                                                                                                      |
| `TrialDownloadedDesignIds` | SS      | optional  | `users.ts:1179` (`ADD TrialDownloadedDesignIds :designSet`)      | `users.ts:144`                                                                    | String-set of `DesignID` tokens used to make trial download counting idempotent (`users.ts:1186-1192`).                          |
| `LastSeenAt`              | S        | optional  | `users.ts:613-620, 674-682`                                      | (write-only audit)                                                                | ISO-8601 on every backend "user seen" event.                                                                                      |
| `LastSeenCount`           | N        | optional  | `users.ts:613-620, 674-682` (`if_not_exists(...) + :inc`)        | (write-only audit)                                                                |                                                                                                                                  |
| `LastEmailDate`           | S        | optional  | `MainWindow.xaml.cs:2219` (`SET LastEmailDate = :now`)           | (write-only audit)                                                                | Set by Uploader after every notification email (`MainWindow.xaml.cs:2198-2227`). ISO-8601 via `DateTime.UtcNow.ToString("o")`.   |
| `LastEmailEntry`          | S        | optional  | `data-access.ts:803-810`, `users.ts:584-591`                     | `MainWindow.xaml.cs:1754, 1906`                                                   | Reader-side "user seen" hook for cid-based notifications.                                                                         |
| `BotSuspect`               | BOOL     | optional  | `users.ts:401-472` (`flagUserAsBotSuspect`, manual/one-off — no automated writer yet) | `data-access.ts:83` (blocks password login), `users.ts:517` (blocks email-link login), `MainWindow.xaml.cs:2020, 2120-2122, 2228, 2310-2312` (excludes from both Uploader mailing-list scanners) | Blocking a suspect's IP alone doesn't stop them logging back in from a fresh IP on an already-verified account — this flag closes that gap account-side. Set manually today (`aws dynamodb update-item`); no UI or automated detector writes it yet. |
| `BotSuspectReason`         | S        | optional  | `users.ts:401-472`                                                | (write-only audit)                                                                | Free-text description of the evidence, e.g. which IP/pattern triggered the flag.                                                 |
| `BotSuspectAt`             | S        | optional  | `users.ts:401-472`                                                | (write-only audit)                                                                | ISO-8601 timestamp of when the account was flagged.                                                                               |

### 4.7 `PasswordResetTokens` (referenced, not in `TableDescription.txt`)

Table name resolved from env `DDB_RESET_TOKENS_TABLE` (default `"PasswordResetTokens"`) in `d:/ann/Git/cross-stitch/src/lib/password-reset.ts:16`. Also pinned in EB env config `d:/ann/Git/cross-stitch/saved_configs/eb-configuration-2025-12-12.cfg.yml:22`.

| Attribute        | DDB type | Required? | Written by                  | Read by                                | Notes                                                                |
| ---------------- | -------- | --------- | --------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| `Token`          | S        | required  | `password-reset.ts:64, 71`  | `password-reset.ts:90-93, 110, 133`    | PK; `crypto.randomBytes(32).toString('hex')` (`password-reset.ts:58`). |
| `Email`          | S        | required  | `password-reset.ts:65`      | `password-reset.ts:101`                | Lowercased.                                                          |
| `CreatedAt`      | S        | required  | `password-reset.ts:66`      | (audit only)                           | ISO-8601.                                                            |
| `ExpiresAtEpoch` | N        | required  | `password-reset.ts:67`      | `password-reset.ts:102, 116`           | Epoch seconds; `RESET_TTL_SECONDS` default `7200` (`password-reset.ts:21`). Likely DynamoDB TTL attribute. |

### 4.8 `SubscriptionEvents` (referenced, not in `TableDescription.txt`)

Table name resolved from env `DDB_SUBSCRIPTION_EVENTS_TABLE` (default `"SubscriptionEvents"`) in `d:/ann/Git/cross-stitch/src/lib/subscription-events.ts:9-10`. PK = `ID` (S) = `SEVT#<iso-utc>#<uuid>` (`subscription-events.ts:68`). All other attributes are S (`Source`, `EventType`, `Status`, `PreviousStatus`, `SubscriptionId`, `UserId`, `Email`, `TrialStartedAt`, `PaypalEventId`, `RawStatus`, `Notes`) — see `subscription-events.ts:69-115`.

### 4.9 `ConverterPatterns` (saved editor patterns)

Table name resolved from env `DDB_PATTERNS_TABLE` (default `"ConverterPatterns"`) in `web/src/lib/pattern-storage.ts:15`. **Self-provisions** — `ensureTable()` (`pattern-storage.ts:52-92`) creates the table plus the GSI on first use, then attempts to enable TTL on `expiresAt` (`pattern-storage.ts:86-89`, see TTL note — currently non-functional). Live check 2026-07-25: `ACTIVE`, 23 items, created 2026-06-26.

Key schema: PK `patternId` (S). GSI `ownerID-index`: PK `ownerID` (S).

| Attribute | DDB type | Required? | Written by | Read by | Notes |
|---|---|---|---|---|---|
| `patternId` | S | required | `pattern-storage.ts:127` (create, `randomUUID()`), `186` (update, key only) | `pattern-storage.ts:216, 233` | PK |
| `name` | S | required | `pattern-storage.ts:128` (create), `164` (update, via `#n`) | `pattern-storage.ts:210,217` | Defaults to `'Untitled'` if blank |
| `width` / `height` | N | required | `pattern-storage.ts:129-130,165-166` | `pattern-storage.ts:210,218-219` | |
| `palette` | S (JSON) | required | `pattern-storage.ts:131,167` | consumer parses `PatternPalette[]` | DMC number/name/RGB/symbol/stitchCount |
| `grid` | S (RLE) | required | `pattern-storage.ts:132,168` | consumer decodes RLE | Capped at 350KB compressed — throws before writing if exceeded (`pattern-storage.ts:122-123,156-157`) |
| `createdAt` | S | required | `pattern-storage.ts:133` (create only) | `pattern-storage.ts:220,239` | **Fixed 2026-07-25** — previously `updatePattern()` overwrote this on every resave (a full `PutItemCommand`); now `updatePattern()` is a partial `UpdateItemCommand` that never mentions `createdAt`, so it's set once at creation and never touched again. Pre-fix rows keep whatever value they already had (their true creation date, since it hadn't been resaved with new code yet — but no way to tell from the data alone which old rows were resaved before this fix and had `createdAt` silently drift). |
| `modifiedAt` | S | required | `pattern-storage.ts:134` (create, same value as `createdAt`), `170,172` (update, `SET modifiedAt = :m`) | `pattern-storage.ts:223,250` | **New 2026-07-25.** True "last saved" timestamp — this is what the UI actually shows/sorts by (`listPatternsByOwner`'s sort, `OpenPatternDialog.tsx`, `ProfilePatternsPageClient.tsx`), since that's the behavior users had already come to expect from the old (mislabeled) `createdAt`. Pre-migration rows have no `modifiedAt` — reader falls back to `createdAt` (`pattern-storage.ts:223,250`). |
| `ownerID` | S | required | `pattern-storage.ts:135,169` | GSI PK (`pattern-storage.ts:208-209`) | Session userId |
| `thumbnail` | S (data-URL) | optional | `pattern-storage.ts:137` (create), `175` (update, `SET`) / `176` (update, `REMOVE` if absent this save) | `pattern-storage.ts:210,224` | Client-generated JPEG data-URL |
| `hiddenColors` | S (JSON `number[]`) | optional | `pattern-storage.ts:138` (create), `178` (update, `SET`) / `179` (update, `REMOVE` if absent/empty this save) | consumer parses | |
| `expiresAt` | N (epoch) | **never written** | — | — | See TTL note below — unlike the `createdAt`/`modifiedAt` split, this gap is **not fixed** |

**TTL gap (found 2026-07-25, live-verified) — still open, deliberately not fixed in this pass.** The code path that creates the table also calls `UpdateTimeToLiveCommand` to enable TTL on `expiresAt` (`pattern-storage.ts:86-89`) — but that call only runs inside the `CreateTableCommand` branch of `ensureTable()`, i.e. only the very first time the table is created. A live `aws dynamodb describe-time-to-live --table-name ConverterPatterns` check (2026-07-25) shows **`TimeToLiveStatus: DISABLED`** on the live table (most likely it already existed, from an earlier local/dev run, by the time this code shipped). Even if TTL were enabled, no code path anywhere in `pattern-storage.ts` ever *writes* an `expiresAt` value to an item — so saved drafts would not expire either way. Net effect: saved editor patterns never expire, full stop. Not urgent (23 items) — fixing it needs a code change (start writing `expiresAt` in `savePattern`/`updatePattern`) plus the same one-off `aws dynamodb update-time-to-live` call already used for `EditorEvents`/`SearchQueries` (§4.13/§4.14) — left as a separate, lower-priority follow-up.

### 4.10 `CrossStitchLikes` (design likes/votes)

Table name resolved from env `DDB_LIKES_TABLE` (default `"CrossStitchLikes"`) in `web/src/lib/design-likes.ts:11`; GSI name from `DDB_LIKES_USER_GSI_NAME` (default `"GSI1"`, line 12). **Does NOT self-provision** — no `CreateTableCommand` anywhere in `design-likes.ts`; must already exist in AWS. Live check 2026-07-25: `ACTIVE`, 62 items, no EB env override (uses code default table name).

Key schema: PK `PK` (S) = `DESIGN#<designId>`, SK `SK` (S) = `USER#<email>`. GSI `GSI1`: PK `GSI1PK` (S) = `USER#<email>`, SK `GSI1SK` (S) = `DESIGN#<designId>`.

| Attribute | DDB type | Required? | Written by | Read by | Notes |
|---|---|---|---|---|---|
| `PK` / `SK` | S | required | `design-likes.ts:211-212` | key reads throughout | One item per (design, user) vote |
| `GSI1PK` / `GSI1SK` | S | required | `design-likes.ts:213-214` | `design-likes.ts:167` (query by user) | Lets "my votes" be queried without a table scan |
| `EntityType` | S | required | `design-likes.ts:215` (`'VOTE'`) | `design-likes.ts:76` (legacy fallback: absence of `VoteDirection`/`VoteValue` + `EntityType==='LIKE'` reads as an up-vote) | `'LIKE'` is a legacy value the reader still tolerates — no current writer sets it |
| `DesignID` | N | required | `design-likes.ts:216` | `design-likes.ts:84-89` | |
| `UserEmail` | S | required | `design-likes.ts:217` | not read back (audit only) | Normalized lowercase |
| `VoteDirection` | S (`'up'`\|`'down'`) | required | `design-likes.ts:218` | `design-likes.ts:63-66` | Canonical vote field |
| `VoteValue` | N (`'1'`\|`'-1'`) | required | `design-likes.ts:219` | `design-likes.ts:68-74` (legacy fallback if `VoteDirection` missing) | |
| `CreatedAt` / `UpdatedAt` | S | required | `design-likes.ts:220-221` | `design-likes.ts:187-188` | Both set to the same value on every write — no separate "first voted" timestamp survives an up→down flip, since a vote change deletes then re-creates the item (`design-likes.ts:227-259`) |

**Risk (already flagged in Pending #11):** because this table doesn't self-provision, if it's ever missing in an environment the app has no code path to notice or recreate it — writes/reads would throw `ResourceNotFoundException` (the module does export `isResourceNotFound` as a helper, `design-likes.ts:272-276`, but nothing currently calls it to trigger a create).

### 4.11 `FeatureRequests`

Table name resolved from env `DDB_FEATURE_REQUESTS_TABLE` (default `"FeatureRequests"`) in `web/src/lib/feature-requests.ts:13`. **Self-provisions** (`ensureTable()`, lines 20-46). Live check 2026-07-25: `ACTIVE`, 4 items, no EB env override.

Key schema: PK `id` (S), no SK, no GSI.

| Attribute | DDB type | Required? | Written by | Read by | Notes |
|---|---|---|---|---|---|
| `id` | S | required | `feature-requests.ts:90` (`randomUUID()`) | key reads | PK |
| `createdAt` | S | required | `feature-requests.ts:91` | `feature-requests.ts:115,145` | ISO-8601 |
| `text` | S | required | `feature-requests.ts:92` | `feature-requests.ts:116` | |
| `importance` | S (`'nice-to-have'`\|`'important'`\|`'need-this'`) | required | `feature-requests.ts:93` | `feature-requests.ts:117` | |
| `status` | S (`'new'`\|`'reviewed'`\|`'planned'`\|`'done'`\|`'rejected'`) | required | `feature-requests.ts:94` (`'new'` on create), `feature-requests.ts:148-159` (`updateFeatureRequestStatus`) | `feature-requests.ts:118` | |
| `email`, `pageUrl`, `userId`, `browserLanguage`, `userAgent` | S | optional | `feature-requests.ts:96-97,104-106` | `feature-requests.ts:119-120,127-129` | Only written if provided |
| `patternWidth`, `patternHeight`, `colorsCount`, `editorTimeSeconds`, `userChangedStitchesCount` | N | optional | `feature-requests.ts:98-102` | `feature-requests.ts:121-125` | Editor-context metadata captured at submission time |
| `exportedPdf` | BOOL | optional | `feature-requests.ts:103` | `feature-requests.ts:126` | |
| `updatedAt` | S | optional | `feature-requests.ts:157` (set only on a status change) | not read back | |

`listFeatureRequests` (`feature-requests.ts:133-146`) does a full table `ScanCommand` — fine at 4 items, would need a GSI (e.g. by `status`) if this table grows large.

### 4.12 `CrossStitchBlogReactions`

Table name resolved from env `DDB_BLOG_REACTIONS_TABLE` (default `"CrossStitchBlogReactions"`) in `web/src/lib/blog-reactions.ts:9`. **Self-provisions** (`ensureTable()`, lines 15-36). Live check 2026-07-25: `ACTIVE`, 0 items, no EB env override.

Key schema: PK `slug` (S), no SK, no GSI.

| Attribute | DDB type | Required? | Written by | Read by | Notes |
|---|---|---|---|---|---|
| `slug` | S | required | key on `UpdateItemCommand`/`GetItemCommand` (`blog-reactions.ts:40,49`) | `blog-reactions.ts:40` | PK; blog post slug |
| `count` | N | required (defaults to 0 if item absent) | `blog-reactions.ts:44-56` (`ADD #c :one`, atomic increment) | `blog-reactions.ts:41,56` | One row per post, no per-user dedup — a reader can increment the same post's count more than once (no rate-limit or per-user tracking in this file) |

Zero items live as of 2026-07-25 — no post has received a reaction yet (blog + reaction feature shipped 2026-07-08).

### 4.13 `EditorEvents` (editor analytics)

Table name resolved from env `DDB_EDITOR_EVENTS_TABLE` (default `"EditorEvents"`) in `web/src/lib/editor-events.ts:15`. **Self-provisions** (`ensureTable()`, lines 25-63). Live check 2026-07-25: `ACTIVE`, **8 221 items**, no EB env override.

Key schema: PK `id` (S). GSI `date-eventType-index`: PK `date` (S), SK `eventType` (S).

| Attribute | DDB type | Required? | Written by | Read by | Notes |
|---|---|---|---|---|---|
| `id` | S | required | `editor-events.ts:197` (`randomUUID()`) | key reads | PK. Also reused as a fixed sentinel `'MILESTONES'` for a singleton row tracking first-ever editor/PDF/feedback milestones (`editor-events.ts:21,96-108`) — that row does **not** carry `eventType`/`date`/`ttl` and is a structurally different item shape sharing the same table. |
| `eventType` | S | required (for real events) | `editor-events.ts:198` | GSI SK, `editor-events.ts:275-276` (scan filter) | e.g. `editor_opened`, `pdf_exported`, `feedback_submitted`, `editor_error` |
| `ts` | S | required | `editor-events.ts:199` | `editor-events.ts:282` (sort) | ISO-8601, full timestamp |
| `date` | S | required | `editor-events.ts:200` | GSI PK | ISO date only (`YYYY-MM-DD`) |
| `sessionId` | S | required | `editor-events.ts:201` | audit only | |
| `ttl` | N (epoch) | required | `editor-events.ts:194,202` | not read back (defaults to 0 if absent, `editor-events.ts:227`) | **Intended** 90-day expiry — see TTL note below |
| `userId`, `patternId`, `source`, `errorCode`, `step`, `importance` | S | optional | `editor-events.ts:205-213` | `editor-events.ts:228-236` | Only written if present on the event |
| `patternWidth`, `patternHeight`, `colorCount` | N | optional | `editor-events.ts:207-209` | `editor-events.ts:230-232` | |

**TTL gap (found 2026-07-25, live-verified) — same class of bug as ConverterPatterns/SearchQueries, but on the largest of the three tables.** Every event writes a `ttl` epoch-seconds attribute 90 days out (`editor-events.ts:194`), intending automatic expiry — but `ensureTable()` (lines 25-63) never calls `UpdateTimeToLiveCommand` for this table, unlike `pattern-storage.ts`'s (non-functional) attempt. A live `aws dynamodb describe-time-to-live --table-name EditorEvents` check (2026-07-25) confirms **`TimeToLiveStatus: DISABLED`**. Net effect: 8 221 items and growing, unboundedly, with no cleanup — this is the table most worth fixing first (of the two/three affected) given its size and growth rate. Fix is a one-off `aws dynamodb update-time-to-live --table-name EditorEvents --time-to-live-specification "Enabled=true,AttributeName=ttl"` (no code change needed — the `ttl` attribute is already being written correctly on every item).

### 4.14 `SearchQueries` (search query logs)

Table name resolved from env `DDB_SEARCH_QUERIES_TABLE` (default `"SearchQueries"`, and explicitly pinned to the same value in the EB environment) in `web/src/lib/search-log.ts:4`. **Does NOT self-provision** — no `CreateTableCommand` anywhere in `search-log.ts`; must already exist in AWS. Live check 2026-07-25: `ACTIVE`, 2 084 items, no EB env override beyond the explicit same-value pin.

Key schema: PK `date` (S), SK `ts` (S) = `<ISO-timestamp>#<6-char-random>`.

| Attribute | DDB type | Required? | Written by | Read by | Notes |
|---|---|---|---|---|---|
| `date` | S | required | `search-log.ts:21` | PK | ISO date only |
| `ts` | S | required | `search-log.ts:22` | SK | `<full ISO timestamp>#<random suffix>` — the random suffix exists purely to keep the SK unique when two searches land in the same millisecond |
| `query` | S | required | `search-log.ts:23` | — | Truncated to 500 chars |
| `source` | S (`'text'`\|`'image'`) | required | `search-log.ts:24` | — | |
| `hasResults` | BOOL | required | `search-log.ts:25` | — | |
| `ttl` | N (epoch) | required | `search-log.ts:18,26` | not read back | **Intended** 90-day expiry — see TTL note below |
| `filters` | S (JSON) | optional | `search-log.ts:29-31` | — | Only written if provided |

Writes are fire-and-forget (`search-log.ts:33-34`, `.catch(err => console.error(...))`) — a missing table or any write failure is logged but never surfaced to the caller or retried, matching the "silently swallows write errors" note in Focus.md Pending #11.

**TTL gap (found 2026-07-25, live-verified) — same bug as `EditorEvents`.** `search-log.ts` computes and writes a correct 90-day `ttl` value on every row, but nothing in this codebase ever calls `UpdateTimeToLiveCommand` for `SearchQueries` (there's no bootstrap function here at all, self-provisioning or otherwise). Live check confirms **`TimeToLiveStatus: DISABLED`**. Net effect: 2 084 items and growing, no cleanup. Same one-off fix as `EditorEvents`: `aws dynamodb update-time-to-live --table-name SearchQueries --time-to-live-specification "Enabled=true,AttributeName=ttl"`.

## 5. API Endpoints / Interfaces

This is **not an HTTP contract**. The interface points are AWS DynamoDB SDK calls from two languages against the same physical table:

| Side          | SDK                                                                     | Entry points                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writer        | AWS SDK for .NET — `Amazon.DynamoDBv2` (`AmazonDynamoDBClient`)         | `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:1057-1090` (`InsertItemIntoDynamoDbAsync` — `PutItemAsync`); `MainWindow.xaml.cs:1493, 1622, 2226, 3144, 3253` (`UpdateItemAsync` for cid back-fill, Verified back-fill, LastEmailDate, Subscription init); `MainWindow.xaml.cs:3036` (`DeleteItemAsync` for suppressed users). |
| Reader        | AWS SDK for JS v3 — `@aws-sdk/client-dynamodb` (`DynamoDBClient`)       | `d:/ann/Git/cross-stitch/src/lib/data-access.ts:17-19, 120-238`; `src/lib/users.ts:19, 232-1336`; `src/lib/password-reset.ts:18, 36-167`; `src/lib/subscription-events.ts:12, 117-124`; `automation/pinterest-agent/scripts/export-design-pin-map.ts:19, 60-75`.                                                                                          |
| Reader (back-write) | AWS SDK for JS v3 — same client                                   | `data-access.ts:625-637` (`UpdateItemCommand` to increment `NDownloaded`); `data-access.ts:803-811` (`UpdateItemCommand` to set `LastEmailEntry`); `users.ts:912-928, 962-1007, 1167-1184` (subscription, trial, download counters).                                                                                       |

Region is `us-east-1` everywhere (`TableDescription.txt:45`, `.ebextensions/04_options.config:3`, `users.ts:15`).

## 6. Versioning

**Unversioned (implicit).** The schema has no `SchemaVersion` attribute on items, no migration script directory, and no document that lists what attributes ought to exist. The `TableDescription.txt` snapshot is the only source of truth and only describes **indexed** attributes (the five in `AttributeDefinitions` — `DesignID`, `EntityType`, `ID`, `NGlobalPage`, `NPage`); the other 30+ attributes are inferred from code on both sides.

**Recommendation:** Adopt either of:

1. A `SchemaVersion` (S) attribute on each item plus a `migrations/` directory with idempotent backfill scripts (matches the existing Uploader pattern of `InitializeUserCidFieldsAsync`, `MarkUsersVerifiedAsync`, `InitializeUserSubscriptionFieldsAsync`).
2. A shared `cross-stitch-platform-docs/contracts/dynamodb-schema.md` that both repos must update in the same PR as any code that reads/writes a new attribute, plus a CI check that diffs the live `aws dynamodb describe-table` output against the committed `TableDescription.txt`.

Either way, **stop the pin-ID drift** (§4.4) by deciding on `PinID` (Uploader's current value) as canonical and adding a one-shot migration that renames any historical `PinterestPinId/PinterestPinID/PinterestID/PinterestId/PinId` attribute to `PinID`, then deleting the defensive read code at `data-access.ts:157-171` and `export-design-pin-map.ts:43-52`.

## 7. Ownership & Contacts

- **Maintainer:** Olga (epolga, `olga.epstein@gmail.com`).
- **Code owner — writer side:** the `Uploader` repo, specifically `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs` (`InsertItemIntoDynamoDbAsync` + the user back-fill helpers).
- **Code owner — reader side:** the `cross-stitch` repo, specifically `d:/ann/Git/cross-stitch/src/lib/data-access.ts`, `src/lib/users.ts`, `src/lib/password-reset.ts`, `src/lib/subscription-events.ts`.
- **Schema artefact owner:** the `cross-stitch` repo, file `TableDescription.txt` at the repo root.

## 8. Dependencies

- **AWS DynamoDB** (region `us-east-1`, account `358174257684`) — `TableDescription.txt:45`.
- **`AlbumID`** — the integer used to build `ID` (`ALB#{albumId:D4}`, `MainWindow.xaml.cs:107`) and the S3 paths (`photos/{AlbumID}/{DesignID}/4.jpg`, `pdfs/{AlbumID}/Stitch{DesignID}_Kit.pdf` — `data-access.ts:154, 367`).
- **`DesignID`** — integer SK on two GSIs (`TableDescription.txt:5-7, 84-92, 116-122`), drives the S3 photo and PDF paths.
- **`NPage`** — string `D5` sort key (`MainWindow.xaml.cs:830`), reused as `nPage` in the design-page slug `/{Caption}-{AlbumID}-{NPage-1}-Free-Design.aspx` (`url-helper.ts CreateDesignUrl`, mirrored at `export-design-pin-map.ts:55-58`).
- **S3 paths** — embedded via attributes: the reader builds `https://d2o1uvvg91z7o4.cloudfront.net/photos/{AlbumID}/{DesignID}/4.jpg` (`data-access.ts:154`) and `https://d2o1uvvg91z7o4.cloudfront.net/pdfs/{AlbumID}/Stitch{DesignID}_Kit.pdf` (`data-access.ts:367`) using only the `AlbumID`/`DesignID` attributes.
- **Pinterest pin IDs** — written by `Uploader` after `_pinterestHelper.UploadPinForPatternAsync` (`MainWindow.xaml.cs:652-659`); insert is aborted with `"Pinterest pin was created without returning a pin ID."` if the pin upload failed (`MainWindow.xaml.cs:656-659`). Read defensively under six historical names (§4.4).
- **Auxiliary tables on the reader side:** `PasswordResetTokens` (`password-reset.ts:16`, EB config `eb-configuration-2025-12-12.cfg.yml:22`), `SubscriptionEvents` (`subscription-events.ts:10`). These are **not described in `TableDescription.txt`**; their existence is inferred from code only.
- **Environment variables on the reader side:** `AWS_REGION`, `DYNAMODB_TABLE_NAME`, `DDB_USERS_TABLE`, `DDB_RESET_TOKENS_TABLE`, `DDB_SUBSCRIPTION_EVENTS_TABLE` — all set in `eb-configuration-2025-12-12.cfg.yml:15-23` and `.ebextensions/04_options.config:1-4`.
- **Configuration on the writer side:** `App.config` keys `UsersTableName` (`App.config:7`), `UserEmailAttribute` (`App.config:8`); plus literal `"CrossStitchItems"` strings (`MainWindow.xaml.cs:783, 809, 837, 863, 1085, 3685`) and fallback default `"CrossStitchItems"` for the `DynamoTableName` key (`MainWindow.xaml.cs:1095, 1540, 1945, 2985, 3542`).

## 9. Error Handling

### 9.1 Missing-attribute behavior (reader)

The reader is **defensive**: every attribute read uses optional-chaining and falls back to `0` (for `N`), `""` (for `S`), or `null`/`undefined`:

- `data-access.ts:142-152` — every attribute is read as `item.X?.N ? parseInt(...) : 0` or `item.X?.S || ""`. A row missing every observed attribute would still produce a valid `Design` object with all zeros and empty strings (only `DesignID > 0` is required to enter the cache at line 174).
- `data-access.ts:153-155` — `ImageUrl` is synthesized from `AlbumID/DesignID` if absent.
- `data-access.ts:156` — `PdfUrl` is `null` if either `AlbumID` or `DesignID` is missing (`getPDFUrl`, line 365-369).
- `data-access.ts:157-171` — pin ID and pin URL fall back through six/five spellings respectively before returning `null`.
- `users.ts:141-176` — `parseUserRecord` returns `null` only if `ID` is missing; every other field is optional.

### 9.2 Writer side (Uploader)

- The writer **does not check** whether a `DESIGN` item already exists for `(AlbumPartitionKey, NPage)` — it issues a raw `PutItemAsync` (`MainWindow.xaml.cs:1089`) which **overwrites** on conflict. Because `NPage` is computed as `maxNPage + 1` (`MainWindow.xaml.cs:830`), collisions are unlikely unless two Uploader instances run concurrently.
- The user-creation path (`users.ts:354-376`) **does** use `ConditionExpression: 'attribute_not_exists(ID)'` and raises `EmailExistsError` on collision (`users.ts:113-120, 369-373`).
- `consumeTrialDownloadByEmail` uses `ConditionExpression` to atomically check the daily/total limit and the design-set membership (`users.ts:1173-1175`); on failure it re-reads and returns the canonical state (`users.ts:1202-1227`).
- `InsertItemIntoDynamoDbAsync` aborts loudly if `PatternInfo.PinId` is empty (`MainWindow.xaml.cs:1062-1063`). This is the *only* writer-side validation.

### 9.3 Orphan risk

`MainWindow.xaml.cs:643-675` performs five steps sequentially (S3 photo upload → Pinterest pin → DDB insert → EB restart). A failure between steps 3 (Pinterest) and 4 (DDB) leaves an **orphan pin** on Pinterest with no DDB row; a failure during step 1 leaves orphan S3 objects with no DDB row. There is no compensating rollback.

### 9.4 Schema-drift impact

Because of the lack of schema versioning (§6), a new attribute added by the writer is **invisible** to the reader until the reader is patched. Conversely, an attribute the reader expects but the writer never sets returns the "missing-attribute" defaults above — i.e. silent zero/empty values, not errors. Pin-ID drift (§4.4) is the visible historical manifestation of this.

## 10. Security & Compliance

- **Plaintext passwords.** `users.ts:325` writes `Password: { S: password }` with the comment `"Storing plain password for migration purposes"`. The legacy `OpenPwd` attribute in `CrossStitchItems` user rows (`data-access.ts:684`) is also plaintext. Any backup, log, or admin scan exposes credentials.
- **Plaintext PayPal subscription IDs** (`users.ts:345`) and **plaintext PayPal client secret** in `eb-configuration-2025-12-12.cfg.yml:25` (the value `secret` is a literal placeholder in that saved config, but the schema admits a real one).
- **No PII redaction in logs.** `data-access.ts:653, 667` log the verifyUser email AND password to stdout (`console.log('verifyUser called with:', { email, password });`).
- **No DynamoDB encryption-at-rest config** visible in `TableDescription.txt` (DynamoDB defaults to AWS-owned key, which is acceptable but not flagged).
- **`DeletionProtectionEnabled: false`** (`TableDescription.txt:146`) — a single misclick can delete the production table.
- **No TTL configured** in the visible portion of `TableDescription.txt`, yet `PasswordResetTokens.ExpiresAtEpoch` (§4.7) is clearly intended as a TTL attribute — if TTL is not configured on that table, expired tokens accumulate.

## 11. Testing & Validation

1. **Live schema diff.** Run from the cross-stitch repo root:

   ```powershell
   aws dynamodb describe-table --region us-east-1 --table-name CrossStitchItems --output json | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 TableDescription.live.txt
   git diff --no-index TableDescription.txt TableDescription.live.txt
   ```

   Any non-empty diff means key schema or GSI changes have happened out-of-band. Same for `CrossStitchUsers`, `PasswordResetTokens`, `SubscriptionEvents`.

2. **Attribute presence audit** — grep both repos to confirm every attribute in §4 is still referenced:

   ```powershell
   # In d:/ann/Git/Uploader
   rg -n '"(ID|NPage|AlbumID|DesignID|EntityType|Caption|Description|Notes|NColors|Width|Height|NDownloaded|NGlobalPage|PinID)"' Uploader/MainWindow.xaml.cs
   # In d:/ann/Git/cross-stitch
   rg -n 'item\.(ID|NPage|AlbumID|DesignID|EntityType|Caption|Description|Notes|NColors|Width|Height|NDownloaded|NGlobalPage|PinID|PinId|PinterestPinId|PinterestPinID|PinterestID|PinterestId)' src/lib/data-access.ts
   ```

3. **Pin-ID drift check** — count how many production rows still use a non-canonical pin attribute. The reporting script at `d:/ann/Git/cross-stitch/automation/pinterest-agent/scripts/export-design-pin-map.ts:43-52` already does the multi-name probe; instrument it to count which branch fired for each row.

4. **Round-trip test** — write a temp item from Uploader (`InsertItemIntoDynamoDbAsync` with a fixture `PatternInfo`), then re-read via `getDesignById` and assert every attribute in §4.2 is set and matches.

5. **Manual smoke** — pick any `EntityType=DESIGN` row in the AWS console and confirm it has exactly the 14 attributes from §4.2 (plus optionally `Text`, `ImageUrl`).

## 12. References

- **Source-of-truth dump:** `d:/ann/Git/cross-stitch/TableDescription.txt:1-153`.
- **EB env-var manifest (table names):** `d:/ann/Git/cross-stitch/.ebextensions/04_options.config:1-4`; saved EB config `d:/ann/Git/cross-stitch/saved_configs/eb-configuration-2025-12-12.cfg.yml:12-27`.
- **Writer code:** `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:107` (PK builder), `:1057-1090` (`InsertItemIntoDynamoDbAsync`), `:1275-1494` (user back-fill helpers), `:2198-2227` (`UpdateLastEmailDateAsync`), `:3072-3190` (`MarkUsersVerifiedAsync`), `:3192-3270` (`InitializeUserSubscriptionFieldsAsync`).
- **Writer-side album reader:** `d:/ann/Git/Uploader/Uploader/Helpers/PinterestBoardCreator.cs:108-160`.
- **Writer-side data model:** `d:/ann/Git/Uploader/Uploader/PatternInfo.cs:14-104` (note the dual `PinId`/`PinID` properties that confirm the historical drift).
- **Writer config:** `d:/ann/Git/Uploader/Uploader/App.config:1-28` (`UsersTableName`, `UserEmailAttribute`).
- **Reader code (Items):** `d:/ann/Git/cross-stitch/src/lib/data-access.ts:1-881`.
- **Reader code (Users):** `d:/ann/Git/cross-stitch/src/lib/users.ts:1-1337`.
- **Reader code (Reset tokens):** `d:/ann/Git/cross-stitch/src/lib/password-reset.ts:1-167`.
- **Reader code (Subscription events):** `d:/ann/Git/cross-stitch/src/lib/subscription-events.ts:1-130`.
- **Pin-ID drift evidence:** `d:/ann/Git/cross-stitch/src/lib/data-access.ts:157-171`; `d:/ann/Git/cross-stitch/automation/pinterest-agent/scripts/export-design-pin-map.ts:42-52`; `d:/ann/Git/Uploader/Uploader/PatternInfo.cs:43-47, 100-104`; `d:/ann/Git/Uploader/Uploader/MainWindow.xaml.cs:1080`.
- **Architecture seed:** `architectureFacts.dynamodb` block in `d:/ann/Git/Uploader/.a5c/runs/01KS7AGP936JGQ989X3GHEQV1T/tasks/01KS7ANCTTG1R1YDC1GVS6X5W5/task.json:91-130`.
- **§4.9-4.14 tables — live-verified 2026-07-25:** `aws dynamodb describe-table` + `describe-time-to-live` for all six, checked against the EB environment (`cross-stitch-com-env-clone`)'s `aws:elasticbeanstalk:application:environment` option settings for name overrides (none found beyond `DDB_SEARCH_QUERIES_TABLE` pinned to its own default). Code: `web/src/lib/pattern-storage.ts`, `web/src/lib/design-likes.ts`, `web/src/lib/feature-requests.ts`, `web/src/lib/blog-reactions.ts`, `web/src/lib/editor-events.ts`, `web/src/lib/search-log.ts`.
- **Repo guidance:** `d:/ann/Git/Uploader/CLAUDE.md` (`do-not-invent` list — this contract complies: every attribute above is grounded in cited code).
