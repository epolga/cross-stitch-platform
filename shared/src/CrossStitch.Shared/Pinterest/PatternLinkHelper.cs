using System;
using System.Collections.Generic;
using System.Text;

namespace CrossStitch.Shared.Pinterest;

/// <summary>
/// Config for building public-facing URLs (design pages and pin images).
/// All values come from the host process (Uploader's App.config or
/// AutoPinner's .env). No <c>ConfigurationManager</c> dependency here.
/// </summary>
public sealed class PatternLinkConfig
{
    /// <summary>Site root, e.g. <c>https://cross-stitch.com</c>. Required.</summary>
    public required string SiteBaseUrl { get; init; }

    /// <summary>
    /// Image host root. Either an explicit CDN base
    /// (e.g. <c>https://d2o1uvvg91z7o4.cloudfront.net</c>) or an S3 bucket
    /// shorthand (<c>https://{bucket}.s3.amazonaws.com</c>) — set whichever
    /// matches your setup.
    /// </summary>
    public required string ImageBaseUrl { get; init; }

    /// <summary>Prefix segment for photo objects under <see cref="ImageBaseUrl"/>. Defaults to <c>photos</c>.</summary>
    public string PhotoPrefix { get; init; } = "photos";

    /// <summary>
    /// Optional template for album URLs. Recognised placeholders:
    /// <c>{AlbumId}</c> and <c>{CaptionSlug}</c>. If empty, falls back to
    /// <c>{SiteBaseUrl}/Free-{slug}-Charts.aspx</c>.
    /// </summary>
    public string AlbumUrlTemplate { get; init; } = "";
}

/// <summary>
/// Builds site and image URLs for patterns so they can be reused across email
/// and Pinterest flows. Portable replacement for the original
/// <c>Uploader.Helpers.PatternLinkHelper</c>.
/// </summary>
public sealed class PatternLinkHelper
{
    private readonly string _siteBaseUrl;
    private readonly string _imageBaseUrl;
    private readonly string _photoPrefix;
    private readonly string _albumUrlTemplate;

    public PatternLinkHelper(PatternLinkConfig config)
    {
        if (config == null) throw new ArgumentNullException(nameof(config));
        if (string.IsNullOrWhiteSpace(config.SiteBaseUrl))
            throw new ArgumentException("SiteBaseUrl is required.", nameof(config));
        if (string.IsNullOrWhiteSpace(config.ImageBaseUrl))
            throw new ArgumentException("ImageBaseUrl is required.", nameof(config));

        _siteBaseUrl = config.SiteBaseUrl.TrimEnd('/');
        _imageBaseUrl = config.ImageBaseUrl.TrimEnd('/');
        _photoPrefix = string.IsNullOrWhiteSpace(config.PhotoPrefix) ? "photos" : config.PhotoPrefix.Trim('/');
        _albumUrlTemplate = config.AlbumUrlTemplate ?? string.Empty;
    }

    public string SiteBaseUrl => _siteBaseUrl;

    public string BuildPatternUrl(PinPatternInfo patternInfo)
    {
        if (patternInfo == null) throw new ArgumentNullException(nameof(patternInfo));

        var caption = (string.IsNullOrWhiteSpace(patternInfo.Title) ? "Cross-stitch-pattern" : patternInfo.Title).Replace(' ', '-');
        int.TryParse(patternInfo.NPage, out var nPage);
        return $"{_siteBaseUrl}/{caption}-{patternInfo.AlbumId}-{nPage - 1}-Free-Design.aspx";
    }

    public string BuildImageUrl(int designId, int albumId, string photoFileName = "4.jpg")
        => $"{_imageBaseUrl}/{_photoPrefix}/{albumId}/{designId}/{photoFileName}";

    public string BuildAlbumUrl(string albumId, string? caption = null)
    {
        if (string.IsNullOrWhiteSpace(albumId))
            throw new ArgumentException("AlbumId must be provided.", nameof(albumId));

        var slug = BuildAlbumCaptionSlug(caption, albumId);

        if (!string.IsNullOrWhiteSpace(_albumUrlTemplate))
        {
            return _albumUrlTemplate
                .Replace("{AlbumId}", albumId)
                .Replace("{CaptionSlug}", slug);
        }
        return $"{_siteBaseUrl}/Free-{slug}-Charts.aspx";
    }

    private static string BuildAlbumCaptionSlug(string? caption, string albumId)
    {
        if (string.IsNullOrWhiteSpace(caption)) return $"Album-{albumId}";

        var parts = new List<string>();
        var current = new StringBuilder();

        foreach (var c in caption)
        {
            if (char.IsLetterOrDigit(c))
                current.Append(c);
            else if (current.Length > 0)
            {
                parts.Add(current.ToString());
                current.Clear();
            }
        }
        if (current.Length > 0) parts.Add(current.ToString());
        if (parts.Count == 0) return $"Album-{albumId}";

        for (var i = 0; i < parts.Count; i++)
        {
            var word = parts[i].ToLowerInvariant();
            parts[i] = char.ToUpperInvariant(word[0]) + word.Substring(1);
        }
        return string.Join("-", parts);
    }
}
