# Milestone 10 — WPF Uploader AI Pin Suggestions

## Goal

When a user selects a PDF folder in the WPF Uploader and previews a design, automatically generate AI-powered suggestions for:

1. **Pin title** — 3 Pinterest-optimized alternatives to choose from
2. **Keywords / hashtags** — 12 hashtags to append to pin description
3. **Board recommendation** — suggested board name based on theme (informational only; actual board is still determined by AlbumBoards.csv)

The user reviews suggestions, optionally edits, then uploads. The chosen title and hashtags are used when creating the Pinterest pin.

---

## What already exists (do not rebuild)

| Component | Path | Notes |
|-----------|------|-------|
| Anthropic API client | `uploader/Uploader/Helpers/SeoTextGenerator.cs` | Claude Haiku 4.5, async, returns null on failure |
| Theme detection | `shared/src/CrossStitch.Shared/Pinterest/PinterestUploader.cs` | `DetectTheme()`, 11 keyword-based themes |
| Board/album mapping | `AlbumBoards.csv` (path from config) | Album ID → Pinterest board ID |
| Pattern data model | `uploader/Uploader/PatternInfo.cs` | title, width, height, nColors, albumId, albumCaption |
| Upload flow | `uploader/Uploader/MainWindow.xaml.cs` | `RunFullUploadFlowAsync()` |
| API key config | `uploader/Uploader/App.private.config` | `AnthropicApiKey` already present and working |
| Helper factory | `uploader/Uploader/Helpers/HelperFactory.cs` | `GetAnthropicApiKey()`, `ToPinPatternInfo()` |

---

## Architecture

### New class: `PinSuggestions`

Typed result returned by the generator (defined in the same file or `PatternInfo.cs`):

```csharp
public class PinSuggestions
{
    public List<string> Titles   { get; set; } = new(); // 3 title alternatives
    public List<string> Hashtags { get; set; } = new(); // 12 hashtags
    public string Board          { get; set; } = "";    // suggested board name (informational)
}
```

### New file: `PinSuggestionsGenerator.cs`

Copy structure exactly from `SeoTextGenerator.cs`:
- Static class, single `public static async Task<PinSuggestions?> GenerateAsync(...)` method
- Direct HTTP POST to `https://api.anthropic.com/v1/messages`
- Model: `claude-haiku-4-5-20251001` (same as SEO — fast and cheap)
- Parse JSON from `content[0].text`
- Return `null` on any failure (never throw, never block upload)
- Use `System.Text.Json` for deserialization

**Signature:**
```csharp
public static async Task<PinSuggestions?> GenerateAsync(
    string title,
    string albumCaption,
    int width,
    int height,
    int nColors,
    IEnumerable<string> availableBoards,
    string apiKey)
```

`availableBoards` comes from reading `AlbumBoards.csv` names (or a hardcoded list of known board names if easier).

### Prompt

Single call, structured JSON output:

```
You are a Pinterest SEO expert for cross-stitch patterns.

Pattern details:
- Title: {title}
- Album / theme: {albumCaption}
- Size: {width} × {height} stitches
- Colors: {nColors}

Available Pinterest boards: {board1}, {board2}, ...

Return ONLY a valid JSON object — no commentary:
{
  "titles": [
    "...",
    "...",
    "..."
  ],
  "hashtags": [
    "#crossstitch",
    "#crossstitchpattern",
    ...10 more pattern-specific tags...
  ],
  "board": "..."
}

Title rules:
- Start with the most searchable keyword
- Always include "cross stitch pattern"
- Max 100 characters each
- Each title should emphasize a different angle (size, difficulty, theme)

Hashtag rules:
- Exactly 12 tags total
- First 2 must be #crossstitch and #crossstitchpattern
- Mix broad (#embroidery, #needlework) and specific (#horsecrossstitch)
- No spaces in hashtags

Board rule:
- Pick exactly one board name from the provided list, verbatim
```

---

## UI Layout

Add a collapsible `Expander` in `MainWindow.xaml`, between the pattern preview fields and the upload button.

```
┌─ AI Pin Suggestions ─────────────────────────────── [▼] ┐
│                                                          │
│  Pin Title:                                              │
│  ● Horse Cross Stitch Pattern | 240×320 | 42 Colors     │ ← RadioButton (default selected)
│  ○ Horse Embroidery Pattern | Beginner Friendly Chart    │ ← RadioButton
│  ○ Beautiful Horse Cross Stitch | Instant PDF Download   │ ← RadioButton
│                                                          │
│  Hashtags (editable):                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ #crossstitch #crossstitchpattern #horse            │  │
│  │ #needlework #embroidery #horsecrossstitch ...      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Suggested board: Animals & Nature          (read-only)  │
│                                                          │
│                            [↻ Re-generate Suggestions]   │
└──────────────────────────────────────────────────────────┘
```

The expander is **open by default** when suggestions are loaded, **hidden** when API key is missing or generation failed.

---

## Implementation steps

### Step 1 — `PinSuggestionsGenerator.cs` (new file)

File: `uploader/Uploader/Helpers/PinSuggestionsGenerator.cs`

1. Copy HTTP client pattern from `SeoTextGenerator.cs` (lines that build the `HttpClient`, payload, and parse `content[0].text`)
2. Define `PinSuggestions` record/class in this file
3. Write the prompt (see above)
4. Deserialize JSON response into `PinSuggestions`
5. Validate: if `Titles` has fewer than 3 items or `Hashtags` fewer than 2, return `null`
6. Wrap everything in try/catch — return `null` on any exception or non-200 response

### Step 2 — `MainWindow.xaml` (add AI Suggestions section)

1. Add an `Expander` element between the existing pattern preview `Grid` and the Upload button
2. Inside the expander:
   - `GroupBox` or `StackPanel` with label "Pin Title:"
   - 3 `RadioButton` elements in a `RadioGroup`, bindings set programmatically in code-behind (not MVVM — keep consistent with existing style)
   - `Label` + `TextBox` (multiline, `AcceptsReturn=False`, `TextWrapping=Wrap`, height ~60) for hashtags
   - `TextBlock` for board suggestion with `"Suggested board: "` prefix
   - `Button` "↻ Re-generate Suggestions" aligned right
3. Name all elements: `aiSuggestionsExpander`, `rbTitle0`, `rbTitle1`, `rbTitle2`, `txtHashtags`, `txtSuggestedBoard`, `btnRegenSuggestions`
4. Set `Visibility="Collapsed"` on the expander by default (shown only after successful generation)

### Step 3 — `MainWindow.xaml.cs` (wire up)

1. Add field: `private PinSuggestions? _suggestions;`

2. After PDF extraction succeeds (end of `LoadPatternAsync()` or equivalent), call:
   ```csharp
   _ = LoadSuggestionsAsync(); // fire-and-forget, non-blocking
   ```

3. Implement `LoadSuggestionsAsync()`:
   ```csharp
   private async Task LoadSuggestionsAsync()
   {
       var apiKey = HelperFactory.GetAnthropicApiKey();
       if (string.IsNullOrEmpty(apiKey)) return;

       var p = _currentPattern; // snapshot before await
       if (p == null) return;

       var boardNames = GetAvailableBoardNames(); // read from AlbumBoards.csv or config
       _suggestions = await PinSuggestionsGenerator.GenerateAsync(
           p.Title, p.AlbumCaption, p.Width, p.Height, p.NColors, boardNames, apiKey);

       Dispatcher.BeginInvoke(new Action(() => PopulateSuggestionsUI()));
   }
   ```

4. Implement `PopulateSuggestionsUI()` (runs on UI thread):
   - If `_suggestions == null` → keep expander collapsed, return
   - Set `rbTitle0.Content`, `rbTitle1.Content`, `rbTitle2.Content` to the 3 titles
   - Select `rbTitle0` by default
   - Set `txtHashtags.Text` to hashtags joined by space
   - Set `txtSuggestedBoard.Text` to `_suggestions.Board`
   - Set `aiSuggestionsExpander.IsExpanded = true`
   - Set `aiSuggestionsExpander.Visibility = Visibility.Visible`

5. Add `BtnRegenSuggestions_Click` handler — disable button, call `LoadSuggestionsAsync()`, re-enable in finally

6. In `RunFullUploadFlowAsync()`, before creating the Pinterest pin:
   ```csharp
   // Use AI-suggested title if one is selected
   string pinTitle = GetSelectedSuggestedTitle() ?? _currentPattern.Title;

   // Append hashtags if present
   string hashtags = txtHashtags.Text.Trim();
   ```
   Pass `pinTitle` and `hashtags` into `PinterestUploader` call.

7. Helper:
   ```csharp
   private string? GetSelectedSuggestedTitle() =>
       rbTitle0.IsChecked == true ? rbTitle0.Content?.ToString() :
       rbTitle1.IsChecked == true ? rbTitle1.Content?.ToString() :
       rbTitle2.IsChecked == true ? rbTitle2.Content?.ToString() : null;
   ```

### Step 4 — `PinterestUploader.cs` in shared library (minor update)

File: `shared/src/CrossStitch.Shared/Pinterest/PinterestUploader.cs`

In `BuildPinDescription()` (or at the call site in `MainWindow.xaml.cs`):
- Accept an optional `string? hashtags` parameter
- If non-null/non-empty, append `"\n\n" + hashtags` after the existing description
- Default `null` → no change to existing behavior

Alternatively, just concatenate at the call site in `MainWindow.xaml.cs` to avoid changing the shared library. Prefer this simpler option.

---

## Error handling contract

| Failure mode | Behavior |
|---|---|
| `AnthropicApiKey` missing | Skip generation silently; suggestions section stays hidden |
| API returns non-200 | Return `null`; suggestions section stays hidden; upload unaffected |
| JSON parse error | Return `null`; same as above |
| Partial response (< 3 titles) | Return `null`; same as above |
| User uploads before generation completes | Upload uses original `txtTitle.Text`, no hashtags appended |

Upload must **never** be blocked by suggestion generation. Generation is always fire-and-forget.

---

## Files to create / modify

| Action | File | What changes |
|--------|------|-------------|
| **Create** | `uploader/Uploader/Helpers/PinSuggestionsGenerator.cs` | New AI generator + `PinSuggestions` class |
| **Modify** | `uploader/Uploader/MainWindow.xaml` | New AI Suggestions expander section |
| **Modify** | `uploader/Uploader/MainWindow.xaml.cs` | Wire suggestions: load, populate UI, inject into upload |
| **Modify** (optional) | `shared/src/CrossStitch.Shared/Pinterest/PinterestUploader.cs` | Hashtag append in description; or do it at call site |

`App.config`, `App.private.config`, DynamoDB schema: **no changes needed.**

---

## Out of scope for this milestone

- Persisting the chosen title/hashtags to DynamoDB (`SeoDescription` is already stored; pin title and hashtags are visible in Pinterest itself)
- Changing the board routing logic (AlbumBoards.csv is the authority; board suggestion is informational only)
- Auto-posting without user review
- Batch suggestions for multiple designs at once

---

## Estimated effort

| Task | Estimate |
|------|----------|
| `PinSuggestionsGenerator.cs` | ~2 h |
| `MainWindow.xaml` UI section | ~1 h |
| `MainWindow.xaml.cs` wiring + upload integration | ~2 h |
| Prompt tuning (test against 3–5 real patterns) | ~1 h |
| Manual end-to-end testing | ~1 h |
| **Total** | **~1 day** |

---

## Testing checklist

- [ ] Select folder → suggestions appear automatically (no button press needed)
- [ ] "Re-generate" button produces fresh suggestions
- [ ] All 3 title radio buttons are selectable; first is pre-selected
- [ ] Hashtag textbox is editable (user can add/remove tags)
- [ ] Board suggestion is displayed but not selectable
- [ ] Full upload uses the selected radio button title, not the original PDF title
- [ ] Full upload appends hashtag text to pin description
- [ ] API failure: suggestions section stays hidden; upload completes normally
- [ ] No API key configured: no crash, no suggestions section shown
- [ ] Upload clicked before suggestions load: uses original title, no hashtags (graceful)
