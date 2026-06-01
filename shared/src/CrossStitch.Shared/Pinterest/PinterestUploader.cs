// Cross-stitch shared Pinterest uploader. Refactored from
// Uploader/Helpers/PinterestHelper.cs to:
//   - target net8.0 (no WPF / System.Configuration dependency)
//   - take all config via constructor (no ConfigurationManager.AppSettings)
//   - accept the portable PinPatternInfo DTO instead of Uploader's
//     WPF-bound PatternInfo
//
// Behaviour matches the original 1:1: theme detection, SEO title /
// description / alt text, board lookup from AlbumBoards.csv, v5 pin POST.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace CrossStitch.Shared.Pinterest;

public sealed class PinterestUploaderConfig
{
    /// <summary>
    /// Path to the AlbumBoards.csv. Optional — when null/empty, resolves via
    /// <see cref="PlatformConfig.ResolveAlbumBoardsCsvPath"/>.
    /// </summary>
    public string? BoardsCsvPath { get; init; }

    /// <summary>Fallback board id used when the album is not in the CSV.</summary>
    public string? DefaultBoardId { get; init; }

    /// <summary>
    /// Fraction of pins that should link to the album page instead of the
    /// design page. 0.0 = all design links (off); 0.20 = 20 % album links.
    /// Only active when <see cref="AbStatsFilePath"/> is also set.
    /// </summary>
    public double AlbumLinkRatio { get; init; } = 0.0;

    /// <summary>
    /// Path to the JSON file that persists design/album pin counts across
    /// sessions. Required for A/B tracking; null disables A/B routing.
    /// </summary>
    public string? AbStatsFilePath { get; init; }
}

public sealed class PinterestUploader
{
    private const string PinterestApiBaseUrl = "https://api.pinterest.com/v5";

    private readonly string _boardsCsvPath;
    private readonly string? _defaultBoardId;
    private readonly PatternLinkHelper _linkHelper;
    private readonly PinterestOAuthClient _oauthClient;
    private readonly PinLinkAbTracker? _abTracker;
    private readonly double _albumLinkRatio;

    // Lazy cache: AlbumID (4-digit string) -> BoardID
    private Dictionary<string, string>? _boardIdByAlbumId;

    public PinterestUploader(
        PinterestUploaderConfig config,
        PatternLinkHelper linkHelper,
        PinterestOAuthClient oauthClient)
    {
        if (config == null) throw new ArgumentNullException(nameof(config));
        _linkHelper = linkHelper ?? throw new ArgumentNullException(nameof(linkHelper));
        _oauthClient = oauthClient ?? throw new ArgumentNullException(nameof(oauthClient));

        _boardsCsvPath = !string.IsNullOrWhiteSpace(config.BoardsCsvPath)
            ? config.BoardsCsvPath
            : PlatformConfig.ResolveAlbumBoardsCsvPath();
        _defaultBoardId = config.DefaultBoardId;

        if (config.AlbumLinkRatio > 0.0 && !string.IsNullOrWhiteSpace(config.AbStatsFilePath))
        {
            _abTracker = new PinLinkAbTracker(config.AbStatsFilePath);
            _albumLinkRatio = config.AlbumLinkRatio;
        }
    }

    /// <summary>
    /// Create a Pinterest Pin for a design. Returns the pin ID and which link
    /// type was used (design page or album page).
    /// </summary>
    public async Task<PinUploadResult> UploadPinForPatternAsync(
        PinPatternInfo pattern,
        bool test = false,
        string? photoFileName = null)
    {
        if (pattern == null) throw new ArgumentNullException(nameof(pattern));

        var working = pattern;
        if (test)
        {
            working = new PinPatternInfo
            {
                AlbumId = 18,
                DesignId = 5375,
                NPage = "00167",
                Title = pattern.Title,
                Description = pattern.Description,
                Notes = pattern.Notes,
                Width = pattern.Width,
                Height = pattern.Height,
                NColors = pattern.NColors,
            };
        }

        if (working.DesignId <= 0)
            throw new ArgumentException("DesignId must be set before uploading a pin.", nameof(pattern));

        // 1. Resolve boardId via CSV (or test board, or default fallback).
        var boardId = test
            ? "257127528664615140"
            : await GetBoardIdForAlbumAsync(working.AlbumId).ConfigureAwait(false);

        // 2. Build URLs.
        var linkType = _abTracker?.Decide(_albumLinkRatio) ?? PinLinkType.Design;
        var patternUrl = linkType == PinLinkType.Album
            ? _linkHelper.BuildAlbumUrl(working.AlbumId.ToString("D4"), working.AlbumCaption)
            : _linkHelper.BuildPatternUrl(working);
        var imageUrl = _linkHelper.BuildImageUrl(working.DesignId, working.AlbumId, photoFileName ?? "4.jpg");

        // 3. Analyze theme + build SEO text.
        var theme = DetectTheme(working);
        var title = BuildPinTitle(working, theme);
        var description = BuildPinDescription(working, theme, working.AlbumId, patternUrl);
        var altText = BuildAltText(working, theme);

        // 4. HTTP POST.
        var accessToken = await _oauthClient.GetValidAccessTokenAsync().ConfigureAwait(false);
        var handler = new HttpClientHandler
        {
            AutomaticDecompression =
                DecompressionMethods.GZip |
                DecompressionMethods.Deflate |
                DecompressionMethods.Brotli,
        };

        using var client = new HttpClient(handler);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var payload = new
        {
            board_id = boardId,
            link = patternUrl,
            title,
            description,
            alt_text = altText,
            media_source = new
            {
                source_type = "image_url",
                url = imageUrl,
            },
        };

        var json = JsonConvert.SerializeObject(payload);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var request = new HttpRequestMessage(HttpMethod.Post, $"{PinterestApiBaseUrl}/pins")
        {
            Content = content,
        };

        var response = await client.SendAsync(request).ConfigureAwait(false);
        var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
            throw new PinterestApiException(response.StatusCode, responseBody);

        var pinResponse = JsonConvert.DeserializeObject<PinResponse>(responseBody);
        if (pinResponse == null || string.IsNullOrWhiteSpace(pinResponse.id))
            throw new PinterestApiException(response.StatusCode, $"Pin created but response had no id. Body: {responseBody}");

        _abTracker?.Record(linkType);
        return new PinUploadResult(pinResponse.id, linkType);
    }

    /// <summary>
    /// Build the same pin description that <see cref="UploadPinForPatternAsync"/>
    /// would send, without making any HTTP call. Used by the CSV export
    /// command so we can hand the user the exact text we'd PATCH onto
    /// each existing pin if we had pin_edit permission.
    /// </summary>
    public string ComposeDescriptionFor(PinPatternInfo pattern)
    {
        if (pattern == null) throw new ArgumentNullException(nameof(pattern));
        var theme = DetectTheme(pattern);
        var patternUrl = _linkHelper.BuildPatternUrl(pattern);
        return BuildPinDescription(pattern, theme, pattern.AlbumId, patternUrl);
    }

    #region Board mapping (AlbumBoards.csv)

    private async Task<string> GetBoardIdForAlbumAsync(int albumId)
    {
        var albumKey = albumId.ToString("D4", CultureInfo.InvariantCulture);

        if (_boardIdByAlbumId == null)
            _boardIdByAlbumId = await LoadBoardsMappingAsync().ConfigureAwait(false);

        if (_boardIdByAlbumId.TryGetValue(albumKey, out var boardId) && !string.IsNullOrWhiteSpace(boardId))
            return boardId;

        if (!string.IsNullOrWhiteSpace(_defaultBoardId))
            return _defaultBoardId;

        throw new InvalidOperationException(
            $"Board for album {albumId} not found in '{_boardsCsvPath}', " +
            "and no default board id is configured.");
    }

    private async Task<Dictionary<string, string>> LoadBoardsMappingAsync()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(_boardsCsvPath)) return map;

        var lines = await File.ReadAllLinesAsync(_boardsCsvPath, Encoding.UTF8).ConfigureAwait(false);
        if (lines.Length <= 1) return map; // header only

        for (var i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (!TryParseAlbumBoardsCsvLine(line, out var albumId, out var boardId)) continue;
            if (!map.ContainsKey(albumId)) map[albumId] = boardId;
        }
        return map;
    }

    private static bool TryParseAlbumBoardsCsvLine(string line, out string albumId, out string boardId)
    {
        albumId = string.Empty;
        boardId = string.Empty;

        var firstComma = line.IndexOf(',');
        var lastComma = line.LastIndexOf(',');
        if (firstComma <= 0 || lastComma <= firstComma) return false;

        albumId = line.Substring(0, firstComma).Trim();

        var raw = line.Substring(lastComma + 1).Trim();
        if (raw.Length >= 2 && raw.StartsWith("\"") && raw.EndsWith("\""))
            raw = raw.Substring(1, raw.Length - 2);
        boardId = raw;

        return !string.IsNullOrEmpty(albumId) && !string.IsNullOrEmpty(boardId);
    }

    #endregion

    #region Theme detection + SEO text

    private sealed class Theme
    {
        public string Code { get; init; } = "";
        public string HumanName { get; init; } = "";
        public string[] Keywords { get; init; } = Array.Empty<string>();
        public string[] Hashtags { get; init; } = Array.Empty<string>();
    }

    private static readonly Theme DefaultTheme = new Theme
    {
        Code = "general",
        HumanName = "cross stitch pattern",
        Keywords = Array.Empty<string>(),
        Hashtags = new[] { "#crossstitch", "#crossstitchpattern", "#embroidery", "#needlework" },
    };

    private static readonly Theme[] Themes =
    {
        new Theme { Code="cats", HumanName="cat cross stitch pattern", Keywords=new[]{"cat","kitten","kitty"}, Hashtags=new[]{"#cat","#cats","#catlover","#kitty"} },
        new Theme { Code="dogs", HumanName="dog cross stitch pattern", Keywords=new[]{"dog","puppy","pup"}, Hashtags=new[]{"#dog","#dogs","#doglover","#puppy"} },
        new Theme { Code="birds", HumanName="bird cross stitch pattern", Keywords=new[]{"bird","sparrow","owl","eagle","parrot"}, Hashtags=new[]{"#birds","#birdart"} },
        new Theme { Code="flowers", HumanName="floral cross stitch pattern", Keywords=new[]{"flower","rose","tulip","poppy","bouquet","floral"}, Hashtags=new[]{"#flowers","#floral"} },
        new Theme { Code="nature", HumanName="nature cross stitch pattern", Keywords=new[]{"forest","tree","mountain","lake","river","landscape","nature"}, Hashtags=new[]{"#landscape","#nature"} },
        new Theme { Code="seaside", HumanName="seaside cross stitch pattern", Keywords=new[]{"sea","ocean","beach","coast","harbor","harbour"}, Hashtags=new[]{"#seaside","#ocean","#beach"} },
        new Theme { Code="city", HumanName="city cross stitch pattern", Keywords=new[]{"city","street","house","houses","architecture","building"}, Hashtags=new[]{"#cityscape","#architecture"} },
        new Theme { Code="people", HumanName="people cross stitch pattern", Keywords=new[]{"girl","boy","woman","man","people","portrait"}, Hashtags=new[]{"#portrait","#people"} },
        new Theme { Code="fantasy", HumanName="fantasy cross stitch pattern", Keywords=new[]{"fairy","dragon","unicorn","wizard","magic","fantasy"}, Hashtags=new[]{"#fantasy","#fairytales"} },
        new Theme { Code="christmas", HumanName="Christmas cross stitch pattern", Keywords=new[]{"christmas","xmas","santa","snowman","reindeer","christmas tree"}, Hashtags=new[]{"#christmas","#christmasdecor","#winter"} },
        new Theme { Code="easter", HumanName="Easter cross stitch pattern", Keywords=new[]{"easter","egg","eggs","bunny","rabbit"}, Hashtags=new[]{"#easter","#spring"} },
    };

    private static Theme DetectTheme(PinPatternInfo pattern)
    {
        var text = $"{pattern.Title} {pattern.Description} {pattern.Notes}".ToLowerInvariant();

        Theme bestTheme = DefaultTheme;
        var bestScore = 0;

        foreach (var theme in Themes)
        {
            var score = 0;
            foreach (var kw in theme.Keywords)
            {
                if (string.IsNullOrWhiteSpace(kw)) continue;
                if (text.Contains(kw.ToLowerInvariant())) score++;
            }
            if (score > bestScore)
            {
                bestScore = score;
                bestTheme = theme;
            }
        }
        return bestTheme;
    }

    private static string BuildPinTitle(PinPatternInfo pattern, Theme theme)
    {
        var titleBase = pattern.Title?.Trim();
        if (string.IsNullOrEmpty(titleBase)) titleBase = "Cross stitch pattern";

        var title = $"{titleBase} – {ToSentenceCase(theme.HumanName)}, printable PDF pattern";
        const int maxLength = 100;
        if (title.Length > maxLength) title = title.Substring(0, maxLength);
        return title;
    }

    private static string BuildAltText(PinPatternInfo pattern, Theme theme)
    {
        var titlePart = pattern.Title;
        if (string.IsNullOrWhiteSpace(titlePart)) titlePart = theme.HumanName;

        var sizePart = pattern.Width > 0 && pattern.Height > 0
            ? $"{pattern.Width} by {pattern.Height} stitches"
            : "";
        var colorPart = pattern.NColors > 0 ? $"{pattern.NColors} colours" : "";

        var parts = new List<string> { "Counted cross stitch pattern", titlePart };
        var techParts = new List<string>();
        if (!string.IsNullOrEmpty(sizePart)) techParts.Add(sizePart);
        if (!string.IsNullOrEmpty(colorPart)) techParts.Add(colorPart);
        if (techParts.Count > 0) parts.Add(string.Join(", ", techParts));

        var alt = string.Join(", ", parts);
        const int maxLength = 500;
        if (alt.Length > maxLength) alt = alt.Substring(0, maxLength);
        return alt;
    }

    private static string BuildPinDescription(PinPatternInfo pattern, Theme theme, int albumId, string patternUrl)
    {
        var sb = new StringBuilder();

        var title = pattern.Title?.Trim();
        if (!string.IsNullOrEmpty(title))
        {
            sb.Append(title);
            sb.Append(" – ");
        }

        sb.Append(theme.HumanName);
        sb.Append(". ");

        if (pattern.Width > 0 && pattern.Height > 0 && pattern.NColors > 0)
        {
            sb.AppendFormat(
                CultureInfo.InvariantCulture,
                "{0} × {1} stitches, {2} colours. ",
                pattern.Width, pattern.Height, pattern.NColors);
        }
        else
        {
            sb.Append("Beautiful counted cross stitch design. ");
        }

        // Small (<100×100) and low-color-count (<10) patterns get a
        // beginner-friendly hook before the closer.
        sb.Append(BuildBeginnerHook(pattern) ?? "");

        sb.Append("Printable PDF chart for embroidery & needlework.");

        var hashtags = new List<string>
        {
            "#crossstitch", "#crossstitchpattern", "#embroidery", "#needlework", "#crossstitchkit",
        };
        hashtags.AddRange(theme.Hashtags);

        var uniqueHashtags = hashtags
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .Select(h => h.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (uniqueHashtags.Count > 0)
        {
            sb.AppendLine();
            sb.Append(string.Join(" ", uniqueHashtags));
        }

        var description = sb.ToString();
        const int maxLength = 500;
        if (description.Length > maxLength)
        {
            // Safety net only — the wording above is sized so the typical
            // pin lands well under 500. Fall back to a word-boundary cut
            // so we never chop mid-word or kill the hashtag line.
            var cut = description.LastIndexOf(' ', maxLength - 1);
            if (cut < maxLength / 2) cut = maxLength;
            description = description.Substring(0, cut).TrimEnd();
        }
        return description;
    }

    private static readonly Regex BlockLevelTagRegex = new(
        @"<\s*(br|/p|p|/li|li|/div|div|/tr|tr)\s*/?\s*>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AnyTagRegex = new(@"<[^>]+>", RegexOptions.Compiled);
    private static readonly Regex WhitespaceRunRegex = new(@"\s+", RegexOptions.Compiled);

    /// <summary>
    /// Strips HTML tags and decodes entities for fields that end up in a
    /// plain-text Pinterest pin description. Block-level tags (br, p, li, …)
    /// become spaces so adjacent values don't collide.
    /// </summary>
    public static string StripHtmlForPlainText(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var t = BlockLevelTagRegex.Replace(input, " ");
        t = AnyTagRegex.Replace(t, string.Empty);
        t = WebUtility.HtmlDecode(t);
        t = WhitespaceRunRegex.Replace(t, " ");
        return t.Trim();
    }

    // Phrases pulled at random when the pattern is small (<100×100 stitches).
    // Mix of explicit examples and variants weaving in the
    // {beginner, easy, simple, quick stitch, small pattern} vocabulary.
    private static readonly string[] BeginnerPhrases = new[]
    {
        "Perfect for beginners.",
        "Easy-to-stitch design.",
        "Suitable for first-time stitchers.",
        "A simple, quick stitch project.",
        "Small pattern, easy for beginners.",
        "Beginner-friendly and easy to stitch.",
        "A quick stitch — small pattern, simple design.",
        "Simple and beginner-friendly small pattern.",
    };

    private static string? BuildBeginnerHook(PinPatternInfo pattern)
    {
        var isSmall = pattern.Width > 0 && pattern.Width < 100
                   && pattern.Height > 0 && pattern.Height < 100;
        var isLowColor = pattern.NColors > 0 && pattern.NColors < 10;

        if (!isSmall && !isLowColor) return null;

        var sb = new StringBuilder();
        if (isSmall)
        {
            sb.Append(BeginnerPhrases[Random.Shared.Next(BeginnerPhrases.Length)]);
            sb.Append(' ');
        }
        if (isLowColor)
        {
            sb.Append("Low color count. ");
        }
        return sb.ToString();
    }

    private static string ToSentenceCase(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return input;

        var sb = new StringBuilder(input.Length);
        var newSentence = true;
        foreach (var c in input)
        {
            if (newSentence && char.IsLetter(c))
            {
                sb.Append(char.ToUpper(c));
                newSentence = false;
            }
            else
            {
                sb.Append(char.ToLower(c));
            }
            if (c == '.' || c == '!' || c == '?') newSentence = true;
        }
        return sb.ToString();
    }

    #endregion

    private sealed class PinResponse
    {
        public string id { get; set; } = "";
    }
}
