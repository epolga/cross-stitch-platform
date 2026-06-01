# cross-stitch-platform

Monorepo for cross-stitch.com — all components in one place.

## Structure

| Folder | Description |
|---|---|
| `web/` | Next.js website (cross-stitch.com) + Pinterest automation agent |
| `uploader/` | WPF desktop uploader — uploads designs, sends subscriber emails |
| `autopinner/` | .NET 8 console worker — backfills Pinterest pins from DynamoDB |
| `shared/` | CrossStitch.Shared — .NET class library shared by Uploader and AutoPinner |
| `docs/` | Platform docs, planning, schema contracts, roadmap |

## Quick start

```
web/        →  cd web && npm install && npm run dev
uploader/   →  open Uploader.sln in Visual Studio
autopinner/ →  cd autopinner && dotnet run --project src/AutoPinner
shared/     →  dotnet build src/CrossStitch.Shared
```

## Notes

- Sensitive files (`.env`, `App.private.config`, `secrets/`) are excluded from this repo.
- The `web/automation/pinterest-agent/` folder contains the daily Pinterest analytics cron.
