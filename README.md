# cross-stitch-platform

Monorepo for cross-stitch.com — all components in one place.

## Structure

| Folder | Description |
|---|---|
| `web/` | Next.js website (cross-stitch.com) |
| `automation/pinterest-agent/` | Daily Pinterest analytics + AI trend cron |
| `automation/autopinner/` | .NET 8 worker — backfills Pinterest pins from DynamoDB |
| `uploader/` | WPF desktop uploader — uploads designs, sends subscriber emails |
| `shared/` | CrossStitch.Shared — .NET class library shared by Uploader and AutoPinner |
| `docs/` | Platform docs, planning, schema contracts, roadmap |

## Quick start

```
web/                        →  cd web && npm install && npm run dev
automation/pinterest-agent/ →  cd automation/pinterest-agent && npm install && npm run daily
automation/autopinner/      →  cd automation/autopinner && dotnet run --project src/AutoPinner
uploader/                   →  open uploader/Uploader.sln in Visual Studio
shared/                     →  dotnet build shared/src/CrossStitch.Shared
```

## Notes

- Sensitive files (`.env`, `App.private.config`, `secrets/`, tokens) are excluded from this repo.
- Email templates live in `uploader/Uploader/Templates/` — loaded at runtime by the WPF app.
