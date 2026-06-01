# CrossStitch.Shared

.NET 8 class library shared between [`Uploader`](../Uploader) (WPF app) and [`AutoPinner`](../AutoPinner) (.NET 8 console worker). Holds the code both projects need for Pinterest uploads, OAuth, and SES email — none of it depends on WPF or `System.Configuration`, so the same DLL works for both consumers.

## What's in here

| Namespace | Purpose |
|---|---|
| `CrossStitch.Shared.Pinterest.PinterestUploader` | Creates Pinterest v5 pins from a `PinPatternInfo`. Includes theme detection, SEO title / description / alt-text, and `AlbumBoards.csv` board lookup. Behaviour identical to the original `Uploader/Helpers/PinterestHelper`. |
| `CrossStitch.Shared.Pinterest.PinterestOAuthClient` (+ `PinterestTokenInfo`, `PinterestTokenStore`, `PinterestTokenResponse`, `PinterestOAuthConfig`) | OAuth code exchange + refresh + JSON-file token persistence. |
| `CrossStitch.Shared.Pinterest.PatternLinkHelper` (+ `PatternLinkConfig`) | Builds site / image / album URLs. |
| `CrossStitch.Shared.Pinterest.PinPatternInfo` | Portable DTO for everything PinterestUploader needs about a design. |
| `CrossStitch.Shared.Pinterest.PinterestApiException` | Structured exception from the Pinterest v5 API (carries `HttpStatusCode`; `IsTransient` for 429 / 5xx). |
| `CrossStitch.Shared.PlatformConfig` | Resolves paths from the workspace-wide `cross-stitch-platform-docs/platform-config.json` (pinterestTokenPath, albumBoardsCsvPath). |
| `CrossStitch.Shared.Email.EmailHelper` | Sends email through AWS SES (simple + raw modes). |

## What's intentionally NOT in here

- `Uploader/PatternInfo.cs` — pulls in `System.Windows.*` (WPF) for PDF-parsing UX. Stays in Uploader. Uploader's `HelperFactory.ToPinPatternInfo` converts it to the portable DTO.
- DDB query / lock / status update code — that's worker-specific. Lives in AutoPinner's `DynamoDbDesignRepository`.
- `IEmailNotifier` abstraction — also worker-specific (cooldown / dedup live in AutoPinner).
- Uploader-specific `PinterestBoardCreator` / `PinterestBoardRenamer` — they consume `PinterestOAuthClient` from this library but the board-management workflows themselves are Uploader-only.

## Design notes

- **No `ConfigurationManager` dependency.** Every configurable value comes through a constructor parameter (`PinterestOAuthConfig`, `PatternLinkConfig`, `PinterestUploaderConfig`). The consumer (Uploader or AutoPinner) is responsible for reading from App.config / .env / wherever and passing the values in. That's what keeps this DLL portable.
- **`PlatformConfig` is the one shared lookup.** It reads `cross-stitch-platform-docs/platform-config.json` to resolve cross-project paths (Pinterest token store, `AlbumBoards.csv`). Located by walking up from the running assembly looking for a sibling `cross-stitch-platform-docs` directory, or by the `PLATFORM_CONFIG_PATH` env var.
- **`AlbumBoards.csv` lives in [`cross-stitch-platform-docs/data/`](../cross-stitch-platform-docs/data/AlbumBoards.csv).** Both Uploader and AutoPinner read the same file via `PlatformConfig.ResolveAlbumBoardsCsvPath()`.

## Build

```powershell
cd CrossStitch.Shared
dotnet build
```

Targets `net8.0`, so both Uploader (`net8.0-windows`) and AutoPinner (`net8.0`) can reference it via `<ProjectReference>`.

## Versioning

There is no NuGet package today — both consumers reference the project file directly. Move to NuGet only if the consumer list grows beyond Uploader + AutoPinner or if cross-machine consumption becomes a real need.
