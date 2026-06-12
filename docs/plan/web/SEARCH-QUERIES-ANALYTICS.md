# Search Queries Analytics

Every AI search on the homepage is logged to the `SearchQueries` DynamoDB table and fires a `ai_search` GA4 event.

## DynamoDB table: SearchQueries

**Region:** us-east-1  
**Key schema:** `date` (PK, string) + `ts` (SK, string)

| Field | Type | Example |
|---|---|---|
| `date` | String | `2026-06-12` |
| `ts` | String | `2026-06-12T17:31:00.123Z#k4f9xb2` |
| `rawQuery` | String | `small floral for beginners` |
| `resolvedFilters` | String (JSON) | `{"searchText":"rose, sunflower, lily","widthTo":60,"ncolorsTo":6}` |

### Browse data in the AWS Console

1. Open [DynamoDB → Tables → SearchQueries → Explore items](https://console.aws.amazon.com/dynamodb/home?region=us-east-1#tables)
2. Choose **Query** (faster) or **Scan** (all rows)
3. To filter by date: add filter `date = 2026-06-12`
4. To export: Actions → Download results to CSV

### Query all searches for a date (AWS CLI)

```bash
aws dynamodb query \
  --table-name SearchQueries \
  --key-condition-expression "#d = :date" \
  --expression-attribute-names '{"#d":"date"}' \
  --expression-attribute-values '{":date":{"S":"2026-06-12"}}' \
  --region us-east-1
```

### Query a date range (scan with filter)

```bash
aws dynamodb scan \
  --table-name SearchQueries \
  --filter-expression "#d BETWEEN :from AND :to" \
  --expression-attribute-names '{"#d":"date"}' \
  --expression-attribute-values '{":from":{"S":"2026-06-01"},":to":{"S":"2026-06-30"}}' \
  --region us-east-1
```

## GA4 custom event: ai_search

Every successful search fires `gtag('event', 'ai_search', ...)` in the browser.

**Parameters:**
- `search_query` — raw text the user typed
- `resolved_filters` — URL query string Claude produced (e.g. `searchText=rose%2C+sunflower&widthTo=60`)

### View in GA4

1. Open GA4 → Reports → Engagement → Events
2. Find `ai_search` in the event list
3. Click it to see parameter breakdown over time

For richer analysis, create a custom exploration:
- Explore → Blank exploration
- Dimensions: `Event name`, `search_query` (custom parameter)
- Metrics: `Event count`

> Note: custom event parameters appear in GA4 after ~24 hours and only after you register them as custom dimensions (Admin → Custom definitions → Custom dimensions → Create → Event-scoped → parameter name: `search_query`).

## What to look for after collecting data

| Signal | What it means |
|---|---|
| Repeated `rawQuery` values | High-demand themes — add more designs in that category |
| Genre terms (`floral`, `animals`) dominating | Users want themed browsing — consider album landing pages |
| Size/color-only queries (empty `searchText`) | Users know what they want technically but not thematically |
| Rare or unusual queries | Niche demand worth exploring |

## Implementation details

- **API route:** `web/src/app/api/ai-search/route.ts` — writes to DynamoDB after Claude returns filters (fire-and-forget, does not block the search response)
- **Component:** `web/src/app/components/HeroSearch.tsx` — fires GA4 event after `router.push`
- **Env var:** `DDB_SEARCH_QUERIES_TABLE=SearchQueries` (set in `.env.local` and EB environment)
- **IAM:** `aws-elasticbeanstalk-ec2-role` → `CrossStitchDynamoDBAccessPolicy` includes `SearchQueries`; `claude-dev` user has `DynamoDBAccessPolicy` for local dev
