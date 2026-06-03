# Lambda Environment Variables

Set these in the Lambda function configuration (Configuration → Environment variables).

| Variable | Example | Source |
|---|---|---|
| `AWS_REGION` | `us-east-1` | Same as .env |
| `AWS_ACCESS_KEY_ID` | `AKIA...` | Same as .env (`CrossStitch-Agents` IAM user) |
| `AWS_SECRET_ACCESS_KEY` | `...` | Same as .env |
| `DYNAMODB_TABLE_NAME` | `CrossStitchItems` | Same as .env |
| `HISTORY_TABLE_NAME` | `CrossStitchBusinessHistory` | (not in .env — uses default in historyStore.ts) |
| `PINTEREST_AD_ACCOUNT_ID` | `549769986352` | Same as .env |
| `PINTEREST_ACCESS_TOKEN` | `pina_...` | Same as .env |
| `GOOGLE_CLIENT_ID` | `637314...` | Same as .env |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Same as .env |
| `GOOGLE_REFRESH_TOKEN` | `1//03...` | Same as .env — **rotate every 7 days** (OAuth Testing mode) |
| `GA4_PROPERTY_ID` | `401821870` | Same as .env |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Same as .env |
| `S3_BUCKET_NAME` | `cross-stitch-ai-reports` | **Required** — not in .env (hardcoded in aiArtifactStore.ts — move to env if needed) |
| `SES_SENDER` | `ann@cross-stitch.com` | Same as .env |
| `SES_RECIPIENT` | `olga.epstein@gmail.com` | Same as .env |
| `SES_CONFIGURATION_SET` | `my-first-configuration-set` | Same as .env |

`REPORTS_DIR` is set automatically to `/tmp` by the handler — do **not** set it in Lambda.

## Google refresh token rotation

The Google OAuth consent screen is in **Testing** mode, which limits refresh tokens to 7 days.
Every Monday morning (before the 5 AM cron), update `GOOGLE_REFRESH_TOKEN` in Lambda:

1. Run `npm run setup-token` locally to get a fresh token
2. AWS Console → Lambda → `cross-stitch-daily-pipeline` → Configuration → Environment variables → Edit `GOOGLE_REFRESH_TOKEN`

The Telegram bot (Milestone 8 remainder) will send a weekly rotation reminder.
