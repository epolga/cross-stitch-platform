using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace CrossStitch.Shared.Pinterest;

/// <summary>
/// Configuration for the Pinterest OAuth client. All fields are constructor-
/// injected by the host process (Uploader reads them from App.config, AutoPinner
/// from .env) so the shared library has no dependency on
/// <c>System.Configuration</c> and can target plain <c>net8.0</c>.
/// </summary>
public sealed class PinterestOAuthConfig
{
    public required string ClientId { get; init; }
    public required string ClientSecret { get; init; }
    public string RedirectUri { get; init; } = "";
    public required string TokenStorePath { get; init; }
}

/// <summary>
/// Model for Pinterest OAuth tokens (what we store on disk).
/// </summary>
public sealed class PinterestTokenInfo
{
    [JsonProperty("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonProperty("refresh_token")]
    public string RefreshToken { get; set; } = string.Empty;

    [JsonProperty("scope")]
    public string Scope { get; set; } = string.Empty;

    [JsonProperty("token_type")]
    public string TokenType { get; set; } = "bearer";

    [JsonProperty("expires_at_utc")]
    public DateTime ExpiresAtUtc { get; set; }

    [JsonIgnore]
    public bool IsExpired =>
        string.IsNullOrEmpty(AccessToken) ||
        DateTime.UtcNow >= ExpiresAtUtc.AddSeconds(-60);

    public static PinterestTokenInfo FromResponse(PinterestTokenResponse response)
    {
        if (response == null) throw new ArgumentNullException(nameof(response));

        return new PinterestTokenInfo
        {
            AccessToken = response.AccessToken,
            RefreshToken = response.RefreshToken,
            Scope = response.Scope,
            TokenType = response.TokenType,
            ExpiresAtUtc = DateTime.UtcNow.AddSeconds(response.ExpiresIn)
        };
    }
}

public sealed class PinterestTokenResponse
{
    [JsonProperty("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonProperty("refresh_token")]
    public string RefreshToken { get; set; } = string.Empty;

    [JsonProperty("scope")]
    public string Scope { get; set; } = string.Empty;

    [JsonProperty("token_type")]
    public string TokenType { get; set; } = "bearer";

    [JsonProperty("expires_in")]
    public int ExpiresIn { get; set; }
}

/// <summary>
/// Simple JSON file-based storage for Pinterest tokens.
/// </summary>
public sealed class PinterestTokenStore
{
    private readonly string _filePath;

    public PinterestTokenStore(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("Token store path must not be empty.", nameof(filePath));
        _filePath = filePath;
    }

    public async Task<PinterestTokenInfo?> LoadAsync()
    {
        if (!System.IO.File.Exists(_filePath)) return null;
        try
        {
            var json = await System.IO.File.ReadAllTextAsync(_filePath).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(json)) return null;
            return JsonConvert.DeserializeObject<PinterestTokenInfo>(json);
        }
        catch
        {
            return null;
        }
    }

    public async Task SaveAsync(PinterestTokenInfo tokenInfo)
    {
        if (tokenInfo == null) throw new ArgumentNullException(nameof(tokenInfo));
        var json = JsonConvert.SerializeObject(tokenInfo, Formatting.Indented);
        await System.IO.File.WriteAllTextAsync(_filePath, json).ConfigureAwait(false);
    }
}

/// <summary>
/// Handles OAuth code exchange + token refresh, and provides valid access
/// tokens for Pinterest API calls.
/// </summary>
public sealed class PinterestOAuthClient
{
    private readonly PinterestOAuthConfig _config;
    private readonly PinterestTokenStore _tokenStore;

    private static readonly HttpClient HttpClient = new HttpClient();
    private const string TokenEndpoint = "https://api.pinterest.com/v5/oauth/token";

    public PinterestOAuthClient(PinterestOAuthConfig config)
    {
        if (config == null) throw new ArgumentNullException(nameof(config));
        if (string.IsNullOrWhiteSpace(config.ClientId) || string.IsNullOrWhiteSpace(config.ClientSecret))
            throw new InvalidOperationException("Pinterest ClientId/ClientSecret must be provided.");
        if (string.IsNullOrWhiteSpace(config.TokenStorePath))
            throw new InvalidOperationException("Pinterest TokenStorePath must be provided.");

        _config = config;
        _tokenStore = new PinterestTokenStore(config.TokenStorePath);
    }

    public async Task<PinterestTokenInfo> ExchangeAuthorizationCodeAsync(string authorizationCode)
    {
        if (string.IsNullOrWhiteSpace(authorizationCode))
            throw new ArgumentException("Authorization code must not be empty.", nameof(authorizationCode));

        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_config.ClientId}:{_config.ClientSecret}"));
        var request = new HttpRequestMessage(HttpMethod.Post, TokenEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        var form = new[]
        {
            new KeyValuePair<string, string>("grant_type", "authorization_code"),
            new KeyValuePair<string, string>("code", authorizationCode),
            new KeyValuePair<string, string>("redirect_uri", _config.RedirectUri),
        };
        request.Content = new FormUrlEncodedContent(form);

        var response = await HttpClient.SendAsync(request).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
            throw new Exception($"Pinterest OAuth token exchange failed: {response.StatusCode} - {body}");

        var tokenResponse = JsonConvert.DeserializeObject<PinterestTokenResponse>(body)
            ?? throw new Exception("Failed to deserialize Pinterest token response.");

        var tokenInfo = PinterestTokenInfo.FromResponse(tokenResponse);
        await _tokenStore.SaveAsync(tokenInfo).ConfigureAwait(false);
        return tokenInfo;
    }

    public async Task<PinterestTokenInfo> RefreshAccessTokenAsync()
    {
        var existing = await _tokenStore.LoadAsync().ConfigureAwait(false);
        if (existing == null || string.IsNullOrEmpty(existing.RefreshToken))
            throw new InvalidOperationException("No refresh token available. You must call ExchangeAuthorizationCodeAsync first.");

        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_config.ClientId}:{_config.ClientSecret}"));
        var request = new HttpRequestMessage(HttpMethod.Post, TokenEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        var form = new[]
        {
            new KeyValuePair<string, string>("grant_type", "refresh_token"),
            new KeyValuePair<string, string>("refresh_token", existing.RefreshToken),
        };
        request.Content = new FormUrlEncodedContent(form);

        var response = await HttpClient.SendAsync(request).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
            throw new Exception($"Pinterest OAuth token refresh failed: {response.StatusCode} - {body}");

        var tokenResponse = JsonConvert.DeserializeObject<PinterestTokenResponse>(body)
            ?? throw new Exception("Failed to deserialize Pinterest token refresh response.");

        // Pinterest may not re-issue a refresh token; keep the old one.
        if (string.IsNullOrEmpty(tokenResponse.RefreshToken))
            tokenResponse.RefreshToken = existing.RefreshToken;

        var tokenInfo = PinterestTokenInfo.FromResponse(tokenResponse);
        await _tokenStore.SaveAsync(tokenInfo).ConfigureAwait(false);
        return tokenInfo;
    }

    public async Task<string> GetValidAccessTokenAsync()
    {
        var tokenInfo = await _tokenStore.LoadAsync().ConfigureAwait(false);
        if (tokenInfo == null || tokenInfo.IsExpired)
            tokenInfo = await RefreshAccessTokenAsync().ConfigureAwait(false);
        return tokenInfo.AccessToken;
    }

    public async Task<HttpClient> CreateAuthorizedHttpClientAsync()
    {
        var accessToken = await GetValidAccessTokenAsync().ConfigureAwait(false);
        var client = new HttpClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }
}
