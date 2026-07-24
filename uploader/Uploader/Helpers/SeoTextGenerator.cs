using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Uploader.Helpers;

/// <summary>
/// Calls the Anthropic Messages API to generate a unique SEO description
/// for a design page. Uses claude-haiku for speed and low cost (~$0.001/call,
/// slightly more with an image attached). Returns null on any failure so the
/// upload flow is never blocked.
/// </summary>
public static class SeoTextGenerator
{
    private const string ApiUrl = "https://api.anthropic.com/v1/messages";
    private const string Model = "claude-haiku-4-5-20251001";
    private const int MaxTokens = 400;

    public static async Task<string?> GenerateAsync(
        string title,
        string albumCaption,
        int width,
        int height,
        int nColors,
        string apiKey,
        string? imagePath = null)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        var hasImage = !string.IsNullOrWhiteSpace(imagePath) && File.Exists(imagePath);
        var skillLevel = DetermineSkillLevel(width, height, nColors);
        var prompt = BuildPrompt(title, albumCaption, width, height, nColors, skillLevel, hasImage);

        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("x-api-key", apiKey);
            client.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var body = new
            {
                model = Model,
                max_tokens = MaxTokens,
                messages = new[] { new { role = "user", content = BuildMessageContent(prompt, hasImage ? imagePath : null) } },
            };

            var json = JsonConvert.SerializeObject(body);
            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(ApiUrl, content).ConfigureAwait(false);

            var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return null;

            var parsed = JObject.Parse(responseBody);
            var text = parsed["content"]?[0]?["text"]?.Value<string>();
            return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Builds the Messages API "content" value for the user turn: a plain
    /// string when there's no image, or a content-block array (image + text)
    /// when one is attached, per the Anthropic vision format.
    /// </summary>
    private static object BuildMessageContent(string prompt, string? imagePath)
    {
        if (string.IsNullOrWhiteSpace(imagePath)) return prompt;

        var mediaType = Path.GetExtension(imagePath).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => (string?)null,
        };
        if (mediaType == null) return prompt;

        var base64 = Convert.ToBase64String(File.ReadAllBytes(imagePath));
        return new object[]
        {
            new { type = "image", source = new { type = "base64", media_type = mediaType, data = base64 } },
            new { type = "text", text = prompt },
        };
    }

    private static string DetermineSkillLevel(int width, int height, int nColors)
    {
        var isSmall = width > 0 && width < 80 && height > 0 && height < 80;
        var isLarge = width > 150 || height > 150;
        var manyColors = nColors > 30;

        if (isSmall && nColors < 10) return "beginner";
        if (isLarge || manyColors) return "advanced";
        return "intermediate";
    }

    private static string BuildPrompt(
        string title, string albumCaption, int width, int height, int nColors, string skillLevel, bool hasImage)
    {
        var sizeStr = width > 0 && height > 0 ? $"{width} × {height} stitches" : "compact";
        var colorStr = nColors > 0 ? $"{nColors} DMC thread colors" : "a curated thread palette";
        var visualInstruction = hasImage
            ? " An image of the finished design is attached — look at it and ground the description in what's actually depicted (subject, pose, colors, composition, mood), not generic language."
            : "";

        return $@"Write an SEO description for this free cross-stitch pattern page.

Design title: {title}
Category: {albumCaption}
Stitch count: {sizeStr}
Colors: {colorStr}
Skill level: {skillLevel}

Instructions:
- Write exactly 2 paragraphs totalling 150–200 words
- Open with a sentence specific to this design (mention the title and what makes the subject interesting to stitch).{visualInstruction}
- Paragraph 1: describe the design and stitching experience (mention the stitch count and color count naturally)
- Paragraph 2: practical details — skill level, that it is a free printable PDF chart with DMC color keys, suitable for Aida fabric
- Use cross-stitch vocabulary naturally: counted cross stitch, Aida, DMC, needlework, embroidery
- Do NOT use these overused openers: ""This pattern"", ""Beautiful"", ""Stunning"", ""This design""
- Output only the two paragraphs, no markdown, no headings";
    }
}
