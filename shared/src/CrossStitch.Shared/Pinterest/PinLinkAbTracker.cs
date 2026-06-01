using System;
using System.IO;
using Newtonsoft.Json;

namespace CrossStitch.Shared.Pinterest;

/// <summary>
/// Tracks design-vs-album pin link counts across sessions so the A/B ratio
/// stays accurate over the lifetime of the account, not just per run.
///
/// Uses deficit tracking: after every pin, if the album fraction is below the
/// target, the next pin goes to an album page; otherwise it goes to a design
/// page. This guarantees the configured ratio holds exactly over time.
/// </summary>
public sealed class PinLinkAbTracker
{
    private readonly string _statsFilePath;

    public PinLinkAbTracker(string statsFilePath)
    {
        if (string.IsNullOrWhiteSpace(statsFilePath))
            throw new ArgumentException("Stats file path must not be empty.", nameof(statsFilePath));
        _statsFilePath = statsFilePath;
    }

    /// <summary>
    /// Decide which link type the next pin should use.
    /// <paramref name="targetAlbumRatio"/> is the fraction that should point to
    /// album pages, e.g. 0.20 for 20 %.
    /// </summary>
    public PinLinkType Decide(double targetAlbumRatio)
    {
        var stats = Read();
        var total = stats.DesignCount + stats.AlbumCount;
        if (total == 0) return PinLinkType.Design;

        var currentAlbumFraction = (double)stats.AlbumCount / total;
        return currentAlbumFraction < targetAlbumRatio ? PinLinkType.Album : PinLinkType.Design;
    }

    /// <summary>
    /// Record a successfully uploaded pin so the next call to
    /// <see cref="Decide"/> reflects it.
    /// </summary>
    public void Record(PinLinkType linkType)
    {
        var stats = Read();
        stats = linkType == PinLinkType.Album
            ? stats with { AlbumCount = stats.AlbumCount + 1 }
            : stats with { DesignCount = stats.DesignCount + 1 };
        Write(stats);
    }

    public (int DesignCount, int AlbumCount) ReadCounts()
    {
        var s = Read();
        return (s.DesignCount, s.AlbumCount);
    }

    private sealed record Stats(int DesignCount, int AlbumCount);

    private Stats Read()
    {
        if (!File.Exists(_statsFilePath)) return new Stats(0, 0);
        try
        {
            var json = File.ReadAllText(_statsFilePath);
            return JsonConvert.DeserializeObject<Stats>(json) ?? new Stats(0, 0);
        }
        catch
        {
            return new Stats(0, 0);
        }
    }

    private void Write(Stats stats)
    {
        var dir = Path.GetDirectoryName(_statsFilePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(_statsFilePath, JsonConvert.SerializeObject(stats, Formatting.Indented));
    }
}
