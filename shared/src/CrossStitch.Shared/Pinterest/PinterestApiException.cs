using System.Net;

namespace CrossStitch.Shared.Pinterest;

/// <summary>
/// Raised by <see cref="PinterestUploader"/> on any non-success HTTP response
/// from the Pinterest v5 API. Carries the status code so callers (AutoPinner's
/// retry policy, the operator's email alert) can distinguish transient
/// failures (429, 5xx) from permanent ones (4xx other than 429) without
/// string-matching the message body.
/// </summary>
public class PinterestApiException : Exception
{
    public HttpStatusCode Status { get; }
    public string ResponseBodySnippet { get; }

    public PinterestApiException(HttpStatusCode status, string body)
        : base($"Pinterest API {(int)status}: {Truncate(body)}")
    {
        Status = status;
        ResponseBodySnippet = Truncate(body);
    }

    /// <summary>
    /// True for HTTP 429 and any 5xx — codes the caller should retry with backoff.
    /// </summary>
    public bool IsTransient => (int)Status == 429 || ((int)Status >= 500 && (int)Status < 600);

    private static string Truncate(string s) => s.Length > 500 ? s[..500] : s;
}
