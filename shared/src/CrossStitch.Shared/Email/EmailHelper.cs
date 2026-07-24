using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace CrossStitch.Shared.Email;

/// <summary>
/// Utility for sending emails through AWS SES. Behaviour-identical with the
/// original <c>Uploader.Helpers.EmailHelper</c>; only the namespace moved.
/// </summary>
public class EmailHelper
{
    /// <summary>
    /// Sends an email and returns the SES-assigned MessageId, so callers can
    /// log which message went to which recipient — the only way to later
    /// correlate an abuse-report/bounce notification back to a specific send.
    /// </summary>
    public async Task<string?> SendEmailAsync(
        AmazonSimpleEmailServiceClient sesClient,
        string sender,
        IEnumerable<string> recipients,
        string subject,
        string textBody,
        string? htmlBody = null,
        IDictionary<string, string>? headers = null,
        string? configurationSetName = null,
        CancellationToken cancellationToken = default)
    {
        if (headers != null && headers.Count > 0)
        {
            return await SendRawEmailAsync(
                    sesClient,
                    sender,
                    recipients,
                    subject,
                    textBody,
                    htmlBody,
                    headers,
                    configurationSetName,
                    cancellationToken)
                .ConfigureAwait(false);
        }

        var destination = new Destination { ToAddresses = recipients.ToList() };

        var body = new Body { Text = new Content(textBody) };
        if (!string.IsNullOrWhiteSpace(htmlBody))
            body.Html = new Content(htmlBody);

        var request = new SendEmailRequest
        {
            Source = sender,
            Destination = destination,
            ConfigurationSetName = configurationSetName,
            Message = new Message
            {
                Subject = new Content(subject),
                Body = body,
            },
        };

        var response = await sesClient.SendEmailAsync(request, cancellationToken).ConfigureAwait(false);
        return response.MessageId;
    }

    private static async Task<string?> SendRawEmailAsync(
        AmazonSimpleEmailServiceClient sesClient,
        string sender,
        IEnumerable<string> recipients,
        string subject,
        string textBody,
        string? htmlBody,
        IDictionary<string, string> headers,
        string? configurationSetName,
        CancellationToken cancellationToken)
    {
        var htmlPart = htmlBody ?? System.Net.WebUtility.HtmlEncode(textBody);
        var boundary = "NextPart_" + System.Guid.NewGuid().ToString("N");
        var toHeader = string.Join(", ", recipients);

        var sb = new StringBuilder();
        sb.AppendLine($"From: {sender}");
        sb.AppendLine($"To: {toHeader}");
        sb.AppendLine($"Subject: {EncodeSubjectRfc2047(subject)}");
        foreach (var header in headers)
            sb.AppendLine($"{header.Key}: {header.Value}");
        sb.AppendLine("MIME-Version: 1.0");
        sb.AppendLine($"Content-Type: multipart/alternative; boundary=\"{boundary}\"");
        sb.AppendLine();

        sb.AppendLine($"--{boundary}");
        sb.AppendLine("Content-Type: text/plain; charset=\"UTF-8\"");
        sb.AppendLine("Content-Transfer-Encoding: base64");
        sb.AppendLine();
        sb.AppendLine(EncodeBodyBase64(textBody));
        sb.AppendLine();

        sb.AppendLine($"--{boundary}");
        sb.AppendLine("Content-Type: text/html; charset=\"UTF-8\"");
        sb.AppendLine("Content-Transfer-Encoding: base64");
        sb.AppendLine();
        sb.AppendLine(EncodeBodyBase64(htmlPart));
        sb.AppendLine();
        sb.AppendLine($"--{boundary}--");

        var rawMessage = new RawMessage
        {
            Data = new MemoryStream(Encoding.UTF8.GetBytes(sb.ToString())),
        };

        var request = new SendRawEmailRequest
        {
            Source = sender,
            Destinations = recipients.ToList(),
            ConfigurationSetName = configurationSetName,
            RawMessage = rawMessage,
        };

        var response = await sesClient.SendRawEmailAsync(request, cancellationToken).ConfigureAwait(false);
        return response.MessageId;
    }

    // RFC 2047 base64 encode for non-ASCII subjects (emoji, Hebrew, etc.)
    private static string EncodeSubjectRfc2047(string subject) =>
        subject.All(c => c <= 127)
            ? subject
            : $"=?UTF-8?B?{Convert.ToBase64String(Encoding.UTF8.GetBytes(subject))}?=";

    // Base64-encode body content with CRLF line wrapping per MIME spec
    private static string EncodeBodyBase64(string text)
    {
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(text));
        var sb = new StringBuilder(base64.Length + (base64.Length / 76 + 1) * 2);
        for (int i = 0; i < base64.Length; i += 76)
        {
            sb.Append(base64, i, Math.Min(76, base64.Length - i));
            if (i + 76 < base64.Length)
                sb.Append("\r\n");
        }
        return sb.ToString();
    }
}
