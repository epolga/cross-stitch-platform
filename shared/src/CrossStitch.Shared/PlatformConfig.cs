using System;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CrossStitch.Shared;

/// <summary>
/// Reads cross-project shared settings from
/// <c>cross-stitch-platform-docs/platform-config.json</c>. Location resolution:
/// <c>PLATFORM_CONFIG_PATH</c> env var wins, otherwise we walk up from the
/// running assembly looking for a sibling <c>cross-stitch-platform-docs</c>
/// repo.
///
/// Path-valued keys in <c>platform-config.json</c> are resolved relative to the
/// workspace root (the parent of the platform-docs repo), unless they are
/// absolute.
/// </summary>
public static class PlatformConfig
{
    private const string PlatformDocsRepoName = "cross-stitch-platform-docs";
    private const string ConfigFileName = "platform-config.json";

    public static string ResolvePinterestTokenPath() =>
        ResolvePath("pinterestTokenPath");

    public static string ResolveAlbumBoardsCsvPath() =>
        ResolvePath("albumBoardsCsvPath");

    public static string ResolvePinAbStatsPath() =>
        ResolvePath("pinAbStatsPath");

    public static string ResolvePath(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Config key must not be empty.", nameof(key));

        var configPath = LocateConfigFile();
        var configRaw = File.ReadAllText(configPath);

        string? value;
        try
        {
            var config = JObject.Parse(configRaw);
            value = (string?)config[key];
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"Failed to parse {ConfigFileName} at {configPath}", ex);
        }

        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException(
                $"'{key}' is not set in {configPath}");

        if (Path.IsPathRooted(value))
            return Path.GetFullPath(value);

        var workspaceRoot = Path.GetDirectoryName(Path.GetDirectoryName(configPath))
            ?? throw new InvalidOperationException(
                $"Could not determine workspace root from {configPath}");

        return Path.GetFullPath(Path.Combine(workspaceRoot, value));
    }

    private static string LocateConfigFile()
    {
        var envOverride = Environment.GetEnvironmentVariable("PLATFORM_CONFIG_PATH");
        if (!string.IsNullOrWhiteSpace(envOverride))
        {
            if (!File.Exists(envOverride))
                throw new FileNotFoundException(
                    $"PLATFORM_CONFIG_PATH points to a file that does not exist: {envOverride}");
            return Path.GetFullPath(envOverride);
        }

        var current = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (current != null)
        {
            var candidate = Path.Combine(current.FullName, PlatformDocsRepoName, ConfigFileName);
            if (File.Exists(candidate))
                return Path.GetFullPath(candidate);
            current = current.Parent;
        }

        throw new FileNotFoundException(
            $"Could not locate {ConfigFileName}. Set PLATFORM_CONFIG_PATH or place the " +
            $"{PlatformDocsRepoName} repo alongside the calling project.");
    }
}
