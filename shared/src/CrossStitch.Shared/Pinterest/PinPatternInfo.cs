namespace CrossStitch.Shared.Pinterest;

/// <summary>
/// Portable DTO with the fields PinterestUploader needs to build a pin.
/// Keeps the shared library free of WPF (which Uploader's rich PatternInfo
/// depends on) and free of any DDB-specific types (which AutoPinner uses).
/// Both Uploader and AutoPinner construct this from their own native models.
/// </summary>
public sealed class PinPatternInfo
{
    public required int AlbumId { get; init; }
    public required int DesignId { get; init; }
    public required string NPage { get; init; }            // zero-padded 5-digit, e.g. "00115"
    public required string Title { get; init; }
    public string Description { get; init; } = "";
    public string Notes { get; init; } = "";
    public int Width { get; init; }
    public int Height { get; init; }
    public int NColors { get; init; }
    /// <summary>Album name used to build the album page URL for A/B testing. Empty = no album link.</summary>
    public string AlbumCaption { get; init; } = "";
}
