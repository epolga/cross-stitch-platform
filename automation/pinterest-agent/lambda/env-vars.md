# Lambda Environment Variables

Set these in the Lambda function configuration (Configuration → Environment variables).

| Variable | Example | Source |
|---|---|---|
| `DYNAMODB_TABLE_NAME` | `CrossStitchItems` | Same as .env |
| `HISTORY_TABLE_NAME` | `CrossStitchBusinessHistory` | default in historyStore.ts |
| `PINTEREST_AD_ACCOUNT_ID` | `549769986352` | Same as .env |
| `PINTEREST_ACCESS_TOKEN` | `pina_...` | Same as .env |
| `GOOGLE_CLIENT_ID` | `637314...` | Same as .env |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Same as .env |
| `GOOGLE_REFRESH_TOKEN` | `1//03...` | Same as .env |
| `GA4_PROPERTY_ID` | `401821870` | Same as .env |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Same as .env |
| `SES_SENDER` | `ann@cross-stitch.com` | Same as .env |
| `SES_RECIPIENT` | `olga.epstein@gmail.com` | Same as .env |
| `SES_CONFIGURATION_SET` | `my-first-configuration-set` | Same as .env |

Do **not** set:
- `AWS_REGION` — reserved, Lambda sets it automatically
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — Lambda uses its IAM execution role
- `REPORTS_DIR` — handler sets it to `/tmp` automatically
- `AI_ARTIFACT_BUCKET` — defaults to `cross-stitch-ai-reports` in aiArtifactStore.ts
