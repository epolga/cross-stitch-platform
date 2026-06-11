using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Uploader.Helpers;

public sealed class PinSuggestions
{
    public List<string> Titles { get; set; } = new();
    public string Board        { get; set; } = "";
}

/// <summary>
/// Calls the Anthropic Messages API to generate Pinterest pin title alternatives,
/// hashtags, and a board suggestion. Returns null on any failure so the upload
/// flow is never blocked.
/// </summary>
public static class PinSuggestionsGenerator
{
    private const string ApiUrl   = "https://api.anthropic.com/v1/messages";
    private const string Model    = "claude-sonnet-4-6";
    private const int    MaxTokens = 300;

    public static async Task<PinSuggestions?> GenerateAsync(
        string title,
        string albumCaption,
        int    width,
        int    height,
        int    nColors,
        string apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        var prompt = BuildPrompt(title, albumCaption, width, height, nColors);

        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("x-api-key", apiKey);
            client.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var body = new
            {
                model      = Model,
                max_tokens = MaxTokens,
                messages   = new[] { new { role = "user", content = prompt } },
            };

            var json = JsonConvert.SerializeObject(body);
            using var requestContent = new StringContent(json, Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(ApiUrl, requestContent).ConfigureAwait(false);

            var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return null;

            var parsed = JObject.Parse(responseBody);
            var text   = parsed["content"]?[0]?["text"]?.Value<string>();
            return string.IsNullOrWhiteSpace(text) ? null : ParseResponse(text);
        }
        catch
        {
            return null;
        }
    }

    private static string BuildPrompt(string title, string albumCaption, int width, int height, int nColors)
    {
        var sizeStr  = width > 0 && height > 0 ? $"{width} × {height} stitches" : "unknown size";
        var colorStr = nColors > 0 ? $"{nColors} DMC colors" : "multiple colors";

        return $@"You are a Pinterest SEO expert for cross-stitch patterns.

Pattern details:
- Title: {title}
- Album / theme: {albumCaption}
- Size: {sizeStr}
- Colors: {colorStr}

Return ONLY a valid JSON object — no commentary, no markdown fences:
{{
  ""titles"": [""..."", ""..."", ""...""],
  ""board"": ""...""
}}

Title rules (exactly 3 alternatives, each max 100 characters):
- Every title must include the words ""cross stitch""
- Start with the most searchable keyword from the pattern subject
- Each title emphasizes a different angle: keyword-rich, size/difficulty, emotional appeal

Board rule:
- Suggest a single Pinterest board name that best fits this pattern (e.g. ""Animals"", ""Flowers & Nature"", ""Christmas"")";
    }

    private static PinSuggestions? ParseResponse(string text)
    {
        try
        {
            var cleaned = text.Trim();

            // Strip accidental markdown fences
            if (cleaned.StartsWith("```"))
            {
                int newline = cleaned.IndexOf('\n');
                if (newline >= 0) cleaned = cleaned.Substring(newline + 1);
            }
            if (cleaned.EndsWith("```"))
                cleaned = cleaned.Substring(0, cleaned.LastIndexOf("```")).TrimEnd();

            cleaned = cleaned.Trim();

            var obj    = JObject.Parse(cleaned);
            var titles = obj["titles"]?.ToObject<List<string>>() ?? new List<string>();
            var board  = obj["board"]? .Value<string>()          ?? "";

            if (titles.Count < 3)
                return null;

            return new PinSuggestions
            {
                Titles = titles.Where(t => !string.IsNullOrWhiteSpace(t)).Take(3).ToList(),
                Board  = board.Trim(),
            };
        }
        catch
        {
            return null;
        }
    }
}
