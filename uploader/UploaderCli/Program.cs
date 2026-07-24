// Headless equivalent of MainWindow.xaml.cs's "Select folder" + "Upload"
// button flow, for batch folders that don't need the WPF UI. Reuses the real
// PatternInfo / HelperFactory / ElasticBeanstalkHelper / SeoTextGenerator
// classes from Uploader.csproj (ProjectReference) rather than re-implementing
// them, so this stays faithful to the actual app instead of a copy that can
// drift out of sync.
//
// Usage:
//   UploaderCli <batchFolderPath> [--yes]
//     --yes   skip the confirmation prompt before the irreversible steps
//             (Pinterest pin creation + DynamoDB insert). Without it, the
//             tool prints exactly what it's about to do and waits for "yes".
//   UploaderCli send-admin-test
//     Sends the design-spotlight newsletter (HtmlEmailTemplate.txt), rendered
//     for the latest design in DynamoDB, to AdminEmail only. Equivalent to
//     MainWindow.xaml.cs's SendAdminUserStyleEmailAsync (the
//     "SendAdminUserEmail" button) - not the Announcement email.

using System.Configuration;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using Amazon;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.S3;
using Amazon.S3.Transfer;
using Amazon.SimpleEmail;
using CrossStitch.Shared.Email;
using CrossStitch.Shared.Pinterest;
using UploadPatterns;
using Uploader.Helpers;

const string ConverterExePath = @"D:\ann\Git\Converter\bin\Release\net9.0\Converter.exe";
const string PhotoPrefix = "photos";
const string PinterestPhotoFileName = "4_pinterest.jpg";

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: UploaderCli <batchFolderPath> [--yes]");
    Console.Error.WriteLine("       UploaderCli send-admin-test");
    Console.Error.WriteLine("       UploaderCli send-newsletter --months <N> [--yes]");
    return 2;
}

if (string.Equals(args[0], "send-admin-test", StringComparison.OrdinalIgnoreCase))
{
    await SendAdminTestAsync();
    return 0;
}

if (string.Equals(args[0], "send-newsletter", StringComparison.OrdinalIgnoreCase))
{
    int monthsIdx = Array.IndexOf(args, "--months");
    if (monthsIdx < 0 || monthsIdx + 1 >= args.Length || !int.TryParse(args[monthsIdx + 1], out int months))
    {
        Console.Error.WriteLine("Usage: UploaderCli send-newsletter --months <N> [--yes]");
        return 2;
    }
    bool newsletterAutoYes = args.Contains("--yes");
    await SendNewsletterAsync(months, newsletterAutoYes);
    return 0;
}

string batchFolderPath = args[0];
bool autoYes = args.Contains("--yes");

if (!Directory.Exists(batchFolderPath))
{
    Console.Error.WriteLine($"Folder not found: {batchFolderPath}");
    return 2;
}

string bucketName = ConfigurationManager.AppSettings["S3BucketName"] ?? "cross-stitch-designs";
var dynamoDbClient = new AmazonDynamoDBClient();
var s3Client = new AmazonS3Client();
var s3TransferUtility = new TransferUtility(s3Client);
var elasticBeanstalkHelper = new ElasticBeanstalkHelper(
    RegionEndpoint.USEast1,
    ConfigurationManager.AppSettings["ElasticBeanstalkEnvironmentName"] ?? "cross-stitch-com-env-clone");
var pinterestUploader = HelperFactory.CreatePinterestUploader();

Console.WriteLine($"=== Folder: {batchFolderPath} ===\n");

// ---- 1. Required PDFs present? ----
string[] requiredPdfs = { "1.pdf", "3.pdf", "5.pdf" };
var missing = requiredPdfs.Where(name => !File.Exists(Path.Combine(batchFolderPath, name))).ToList();
if (missing.Count > 0)
{
    Console.Error.WriteLine($"Missing required PDFs: {string.Join(", ", missing)}");
    return 2;
}

// ---- 2. AlbumID from the single .txt file ----
int albumId = LoadAlbumIdFromTxt(batchFolderPath);
Console.WriteLine($"AlbumID: {albumId}");

// ---- 3. Parse PatternInfo from 1.pdf ----
string pdf1Path = Path.Combine(batchFolderPath, "1.pdf");
var patternInfo = new PatternInfo(pdf1Path) { AlbumId = albumId };
Console.WriteLine($"Title: {patternInfo.Title}");
Console.WriteLine($"Size: {patternInfo.Width} x {patternInfo.Height} stitches, {patternInfo.NColors} colors");

// ---- 4. Extract preview image from PDF -> 4.jpg / 4_pinterest.jpg ----
string imageFilePath = Path.Combine(batchFolderPath, "4.jpg");
string pinterestImageFilePath = Path.Combine(batchFolderPath, PinterestPhotoFileName);
ExtractAndSaveImages(pdf1Path, imageFilePath, pinterestImageFilePath);
Console.WriteLine($"Saved {imageFilePath} and {pinterestImageFilePath}");

// ---- 5. NPage + DesignID (same DDB queries as MainWindow) ----
patternInfo.NPage = await GetNextNPageAsync(dynamoDbClient, albumId);
patternInfo.DesignID = await GetNextDesignIdAsync(dynamoDbClient);
int maxGlobalPage = await GetMaxGlobalPageAsync(dynamoDbClient);
int nGlobalPage = maxGlobalPage + 1;
patternInfo.AlbumCaption = await GetAlbumCaptionAsync(dynamoDbClient, albumId);

Console.WriteLine($"AlbumCaption: {patternInfo.AlbumCaption}");
Console.WriteLine($"Assigned DesignID: {patternInfo.DesignID}, NPage: {patternInfo.NPage}, NGlobalPage: {nGlobalPage}");

string sccFile = Directory.GetFiles(batchFolderPath, "*.scc").FirstOrDefault()
    ?? throw new Exception(".scc file expected.");

// ---- 6. S3 uploads (chart, PDFs via Converter.exe, images) ----
Console.WriteLine("\nUploading chart (.scc) to S3...");
await UploadChartToS3Async(s3TransferUtility, bucketName, patternInfo.DesignID, sccFile, patternInfo.Title);

Console.WriteLine("Converting + uploading PDFs to S3...");
await UploadPdfToS3Async(s3TransferUtility, bucketName, batchFolderPath, albumId, patternInfo.DesignID);

Console.WriteLine("Uploading images to S3...");
await UploadPhotoFileAsync(s3TransferUtility, bucketName, albumId, patternInfo.DesignID, imageFilePath);
await UploadPhotoFileAsync(s3TransferUtility, bucketName, albumId, patternInfo.DesignID, pinterestImageFilePath);

// ---- 7. Confirmation checkpoint before the irreversible part ----
Console.WriteLine("\n=== About to do the irreversible part ===");
Console.WriteLine($"- Create a PUBLIC Pinterest pin for DesignID {patternInfo.DesignID} (title: \"{patternInfo.Title}\")");
Console.WriteLine($"- Insert a live catalog item into DynamoDB CrossStitchItems (ALB#{albumId:D4}, NPage {patternInfo.NPage})");
Console.WriteLine("- Restart the live cross-stitch-com-env-clone Elastic Beanstalk environment");
if (!autoYes)
{
    Console.Write("Type 'yes' to proceed: ");
    string? answer = Console.ReadLine();
    if (!string.Equals(answer?.Trim(), "yes", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine("Aborted before the irreversible steps. S3 uploads above already happened.");
        return 1;
    }
}

// ---- 8. Pinterest pin ----
Console.WriteLine("\nCreating Pinterest pin...");
var pinResult = await pinterestUploader.UploadPinForPatternAsync(
    patternInfo.ToPinPatternInfo(),
    photoFileName: PinterestPhotoFileName);
patternInfo.PinId = pinResult.PinId;
Console.WriteLine($"Pinterest pin created: {pinResult.PinId} (linkType={pinResult.LinkType})");

// ---- 9. SEO description (vision-enabled) ----
Console.WriteLine("Generating SEO description...");
string? seoDescription = await SeoTextGenerator.GenerateAsync(
    patternInfo.Title,
    patternInfo.AlbumCaption,
    patternInfo.Width,
    patternInfo.Height,
    patternInfo.NColors,
    HelperFactory.GetAnthropicApiKey() ?? string.Empty,
    imageFilePath);
Console.WriteLine(string.IsNullOrWhiteSpace(seoDescription)
    ? "SEO description: skipped (API unavailable)."
    : $"SEO description: {seoDescription.Length} chars generated.");

// ---- 10. DynamoDB insert ----
Console.WriteLine("Inserting item into DynamoDB...");
await InsertItemIntoDynamoDbAsync(dynamoDbClient, albumId, patternInfo, nGlobalPage, pinResult.LinkType, seoDescription);
Console.WriteLine("Inserted.");

// ---- 11. Restart Elastic Beanstalk ----
Console.WriteLine("Restarting Elastic Beanstalk environment...");
bool restarted = await elasticBeanstalkHelper.RestartEnvironmentAsync(msg => Console.Write(msg));
Console.WriteLine(restarted ? "Restart requested successfully." : "Restart failed.");

Console.WriteLine($"\n=== Done. DesignID {patternInfo.DesignID}, PinID {patternInfo.PinId} ===");
return 0;

// ---------------- helpers (mirrors of MainWindow.xaml.cs private methods) ----------------

static int LoadAlbumIdFromTxt(string batchFolderPath)
{
    var txtFiles = Directory.GetFiles(batchFolderPath, "*.txt");
    if (txtFiles.Length != 1)
        throw new Exception("Exactly one .txt file expected for AlbumID.");

    string name = Path.GetFileNameWithoutExtension(txtFiles[0]);
    if (!int.TryParse(name, out int albumId) || albumId <= 0)
        throw new Exception("Invalid AlbumID in .txt file.");

    return albumId;
}

static void ExtractAndSaveImages(string pdfPath, string imageFilePath, string pinterestImageFilePath)
{
    var images = ExtractImages(pdfPath);
    if (images.Count < 1)
        throw new Exception("Failed to get image from PDF.");

    using var bitmap = new System.Drawing.Bitmap(images[0]);
    bitmap.RotateFlip(System.Drawing.RotateFlipType.RotateNoneFlipY);
    bitmap.Save(imageFilePath, System.Drawing.Imaging.ImageFormat.Jpeg);

    using var pinterestImage = CreatePinterestImage(bitmap);
    pinterestImage.Save(pinterestImageFilePath, System.Drawing.Imaging.ImageFormat.Jpeg);
}

static List<System.Drawing.Image> ExtractImages(string pdfPath)
{
    var images = new List<System.Drawing.Image>();
    using var reader = new iTextSharp.text.pdf.PdfReader(pdfPath);
    for (int i = 0; i <= reader.XrefSize - 1; i++)
    {
        var obj = reader.GetPdfObject(i);
        if (obj == null || !obj.IsStream()) continue;

        var stream = (iTextSharp.text.pdf.PRStream)obj;
        var subtype = stream.Get(iTextSharp.text.pdf.PdfName.SUBTYPE);
        if (subtype == null || !iTextSharp.text.pdf.PdfName.IMAGE.Equals(subtype)) continue;

        try
        {
            var imgObj = new iTextSharp.text.pdf.parser.PdfImageObject(stream);
            var img = imgObj.GetDrawingImage();
            if (img != null) images.Add(img);
        }
        catch { /* ignore image that cannot be parsed */ }
    }
    return images;
}

static System.Drawing.Bitmap CreatePinterestImage(System.Drawing.Bitmap source)
{
    const int targetWidth = 1000;
    const int targetHeight = 1500;

    var canvas = new System.Drawing.Bitmap(targetWidth, targetHeight, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
    using var graphics = System.Drawing.Graphics.FromImage(canvas);
    graphics.Clear(System.Drawing.Color.White);
    graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
    graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
    graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
    graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

    float scale = Math.Min(targetWidth / (float)source.Width, targetHeight / (float)source.Height);
    int scaledWidth = (int)Math.Round(source.Width * scale);
    int scaledHeight = (int)Math.Round(source.Height * scale);
    int x = (targetWidth - scaledWidth) / 2;
    bool dockTop = source.Width >= source.Height;
    int y = dockTop ? 0 : (targetHeight - scaledHeight) / 2;

    graphics.DrawImage(source, new System.Drawing.Rectangle(x, y, scaledWidth, scaledHeight));
    // Watermark text intentionally omitted here for portrait sources (dockTop
    // false) — matches MainWindow.xaml.cs, which only draws it when dockTop.
    return canvas;
}

static async Task<int> GetMaxGlobalPageAsync(AmazonDynamoDBClient client)
{
    var response = await client.QueryAsync(new QueryRequest
    {
        TableName = "CrossStitchItems",
        IndexName = "Designs-index",
        KeyConditionExpression = "EntityType = :et",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue> { { ":et", new AttributeValue { S = "DESIGN" } } },
        ScanIndexForward = false,
        Limit = 1,
        ProjectionExpression = "NGlobalPage",
    });
    return response.Items.Count > 0 && response.Items[0].ContainsKey("NGlobalPage")
        ? int.Parse(response.Items[0]["NGlobalPage"].N)
        : 0;
}

static async Task<string> GetNextNPageAsync(AmazonDynamoDBClient client, int albumId)
{
    string albumPartitionKey = $"ALB#{albumId:D4}";
    var response = await client.QueryAsync(new QueryRequest
    {
        TableName = "CrossStitchItems",
        KeyConditionExpression = "ID = :id",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue> { { ":id", new AttributeValue { S = albumPartitionKey } } },
        ScanIndexForward = false,
        Limit = 1,
        ProjectionExpression = "NPage",
    });

    int maxNPage = 0;
    if (response.Items.Count > 0 && response.Items[0].ContainsKey("NPage"))
    {
        string current = response.Items[0]["NPage"].S;
        string trimmed = current.TrimStart('0');
        maxNPage = string.IsNullOrEmpty(trimmed) ? 0 : int.Parse(trimmed);
    }
    return (maxNPage + 1).ToString("D5");
}

static async Task<int> GetNextDesignIdAsync(AmazonDynamoDBClient client)
{
    var response = await client.QueryAsync(new QueryRequest
    {
        TableName = "CrossStitchItems",
        IndexName = "DesignsByID-index",
        KeyConditionExpression = "EntityType = :et",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue> { { ":et", new AttributeValue { S = "DESIGN" } } },
        ScanIndexForward = false,
        Limit = 1,
        ProjectionExpression = "DesignID",
    });
    return response.Items.Count > 0 && response.Items[0].ContainsKey("DesignID")
        ? int.Parse(response.Items[0]["DesignID"].N) + 1
        : 1;
}

static async Task<string> GetAlbumCaptionAsync(AmazonDynamoDBClient client, int albumId)
{
    try
    {
        var response = await client.QueryAsync(new QueryRequest
        {
            TableName = "CrossStitchItems",
            KeyConditionExpression = "ID = :pk",
            FilterExpression = "EntityType = :albumType",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue { S = $"ALB#{albumId:D4}" } },
                { ":albumType", new AttributeValue { S = "ALBUM" } },
            },
            ProjectionExpression = "Caption",
            Limit = 1,
        });
        if (response.Items.Count > 0 && response.Items[0].TryGetValue("Caption", out var captionAttr) && !string.IsNullOrWhiteSpace(captionAttr.S))
            return captionAttr.S;
    }
    catch { /* non-fatal */ }
    return string.Empty;
}

static async Task UploadChartToS3Async(TransferUtility s3, string bucketName, int designId, string sccFilePath, string title)
{
    string paddedDesignId = designId.ToString("D5");
    string key = $"charts/{paddedDesignId}_{title}.scc";
    await s3.UploadAsync(new TransferUtilityUploadRequest
    {
        FilePath = sccFilePath,
        BucketName = bucketName,
        Key = key,
        ContentType = "text/scc",
    });
}

static async Task UploadPdfToS3Async(TransferUtility s3, string bucketName, string batchFolderPath, int albumId, int designId)
{
    string pdf1Path = Path.Combine(batchFolderPath, "1.pdf");
    string pdf3Path = Path.Combine(batchFolderPath, "3.pdf");
    string pdf5Path = Path.Combine(batchFolderPath, "5.pdf");

    string mainKey = $"pdfs/{albumId}/Stitch{designId}_Kit.pdf";
    string designFolder = $"pdfs/{albumId}/{designId}";
    string key1 = $"{designFolder}/Stitch{designId}_1_Kit.pdf";
    string key3 = $"{designFolder}/Stitch{designId}_3_Kit.pdf";
    string key5 = $"{designFolder}/Stitch{designId}_5_Kit.pdf";

    string convertedPdf1 = await ConvertPdfForUploadAsync(pdf1Path);
    string convertedPdf3 = await ConvertPdfForUploadAsync(pdf3Path);
    string convertedPdf5 = await ConvertPdfForUploadAsync(pdf5Path);

    await UploadPdfFileAsync(s3, bucketName, convertedPdf1, mainKey);
    await UploadPdfFileAsync(s3, bucketName, convertedPdf1, key1);
    await UploadPdfFileAsync(s3, bucketName, convertedPdf3, key3);
    await UploadPdfFileAsync(s3, bucketName, convertedPdf5, key5);
}

static async Task<string> ConvertPdfForUploadAsync(string inputPath)
{
    if (!File.Exists(inputPath)) throw new FileNotFoundException("Input PDF not found.", inputPath);
    if (!File.Exists(ConverterExePath)) throw new FileNotFoundException("Converter.exe not found.", ConverterExePath);

    string? folder = Path.GetDirectoryName(inputPath);
    string outputPath = Path.Combine(folder ?? string.Empty, $"{Path.GetFileNameWithoutExtension(inputPath)}.converted.pdf");

    var startInfo = new ProcessStartInfo
    {
        FileName = ConverterExePath,
        CreateNoWindow = true,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
    };
    startInfo.ArgumentList.Add(inputPath);

    using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Failed to start PDF converter process.");
    Task<string> stdOutTask = process.StandardOutput.ReadToEndAsync();
    Task<string> stdErrTask = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    string stdOut = await stdOutTask;
    string stdErr = await stdErrTask;

    if (process.ExitCode != 0)
    {
        string details = string.IsNullOrWhiteSpace(stdErr) ? stdOut : stdErr;
        throw new Exception($"Converter failed for {Path.GetFileName(inputPath)} (exit {process.ExitCode}). {details}".Trim());
    }
    if (!File.Exists(outputPath))
        throw new Exception($"Converter did not produce expected output: {outputPath}");

    return outputPath;
}

static Task UploadPdfFileAsync(TransferUtility s3, string bucketName, string filePath, string key)
{
    return s3.UploadAsync(new TransferUtilityUploadRequest
    {
        FilePath = filePath,
        BucketName = bucketName,
        Key = key,
        ContentType = "application/pdf",
    });
}

static Task UploadPhotoFileAsync(TransferUtility s3, string bucketName, int albumId, int designId, string filePath)
{
    string fileName = Path.GetFileName(filePath);
    string photoKey = $"{PhotoPrefix}/{albumId}/{designId}/{fileName}";
    return s3.UploadAsync(new TransferUtilityUploadRequest
    {
        FilePath = filePath,
        BucketName = bucketName,
        Key = photoKey,
        ContentType = "image/jpeg",
    });
}

static async Task InsertItemIntoDynamoDbAsync(
    AmazonDynamoDBClient client, int albumId, PatternInfo patternInfo, int nGlobalPage, PinLinkType pinLinkType, string? seoDescription)
{
    if (string.IsNullOrWhiteSpace(patternInfo.PinId))
        throw new InvalidOperationException("Pinterest PinID is missing; aborting DynamoDB insert.");

    var item = new Dictionary<string, AttributeValue>
    {
        { "ID", new AttributeValue { S = $"ALB#{albumId:D4}" } },
        { "NPage", new AttributeValue { S = patternInfo.NPage } },
        { "AlbumID", new AttributeValue { N = albumId.ToString() } },
        { "Caption", new AttributeValue { S = patternInfo.Title } },
        { "Description", new AttributeValue { S = patternInfo.Description } },
        { "DesignID", new AttributeValue { N = patternInfo.DesignID.ToString() } },
        { "EntityType", new AttributeValue { S = "DESIGN" } },
        { "Height", new AttributeValue { N = patternInfo.Height.ToString() } },
        { "NColors", new AttributeValue { N = patternInfo.NColors.ToString() } },
        { "NDownloaded", new AttributeValue { N = "0" } },
        { "NGlobalPage", new AttributeValue { N = nGlobalPage.ToString() } },
        { "Notes", new AttributeValue { S = patternInfo.Notes } },
        { "Width", new AttributeValue { N = patternInfo.Width.ToString() } },
        { "PinID", new AttributeValue { S = patternInfo.PinId } },
        { "PinLinkType", new AttributeValue { S = pinLinkType.ToString().ToUpperInvariant() } },
    };
    if (!string.IsNullOrWhiteSpace(seoDescription))
        item["SeoDescription"] = new AttributeValue { S = seoDescription };

    await client.PutItemAsync(new PutItemRequest { TableName = "CrossStitchItems", Item = item });
}

// ---------------- send-admin-test (mirrors MainWindow.xaml.cs's SendAdminUserStyleEmailAsync) ----------------

static async Task SendAdminTestAsync()
{
    string? sender = ConfigurationManager.AppSettings["SenderEmail"];
    string? admin = ConfigurationManager.AppSettings["AdminEmail"];
    if (string.IsNullOrEmpty(sender) || string.IsNullOrEmpty(admin))
        throw new InvalidOperationException("SenderEmail/AdminEmail must be configured.");

    var dynamoDbClient = new AmazonDynamoDBClient();
    var sesClient = new AmazonSimpleEmailServiceClient();
    var emailHelper = new EmailHelper();
    var linkHelper = HelperFactory.CreatePatternLinkHelper();
    string? sesConfigurationSetName = ConfigurationManager.AppSettings["SesConfigurationSetName"];

    var latestDesign = await GetLatestDesignEmailInfoAsync(dynamoDbClient);
    Console.WriteLine($"Latest design: DesignID {latestDesign.DesignId}, AlbumID {latestDesign.AlbumId}, \"{latestDesign.Title}\"");

    var template = LoadHtmlEmailTemplate();
    string patternUrl = BuildPatternUrl(linkHelper, latestDesign);
    string imageUrl = linkHelper.BuildImageUrl(latestDesign.DesignId, latestDesign.AlbumId);
    string altText = string.IsNullOrWhiteSpace(latestDesign.Title) ? "New cross stitch pattern" : latestDesign.Title;
    string patternUrlWithTracking = AppendTrackingParameters(patternUrl, "admin", DateTime.UtcNow.ToString("yyMMdd", CultureInfo.InvariantCulture));
    string siteUrlWithTracking = AppendTrackingParameters(linkHelper.SiteBaseUrl, "admin", DateTime.UtcNow.ToString("yyMMdd", CultureInfo.InvariantCulture));
    string unsubscribeUrl = BuildUnsubscribeUrl(linkHelper, "preview-admin-unsubscribe-token");

    var content = RenderHtmlEmailContent(template, "admin", patternUrlWithTracking, siteUrlWithTracking, imageUrl, altText, unsubscribeUrl);

    Console.WriteLine($"Subject: {content.Subject}");
    Console.WriteLine("Sending to admin...");
    await emailHelper.SendEmailAsync(sesClient, sender, new[] { admin }, content.Subject, content.TextBody, content.HtmlBody, configurationSetName: sesConfigurationSetName);
    Console.WriteLine("Sent.");
}

static async Task<LatestDesignEmailInfo> GetLatestDesignEmailInfoAsync(AmazonDynamoDBClient client)
{
    var response = await client.QueryAsync(new QueryRequest
    {
        TableName = "CrossStitchItems",
        IndexName = "DesignsByID-index",
        KeyConditionExpression = "EntityType = :et",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue> { { ":et", new AttributeValue { S = "DESIGN" } } },
        ScanIndexForward = false,
        Limit = 1,
        ProjectionExpression = "DesignID, AlbumID, NPage, Caption, PinID",
    });
    if (response.Items.Count == 0)
        throw new InvalidOperationException("No design records were found in DynamoDB.");

    var item = response.Items[0];
    int designId = int.Parse(item["DesignID"].N);
    int albumId = int.Parse(item["AlbumID"].N);
    string nPage = item.TryGetValue("NPage", out var np) ? np.S : "";
    string title = item.TryGetValue("Caption", out var cap) && !string.IsNullOrWhiteSpace(cap.S) ? cap.S : $"Design {designId}";
    string pinId = item.TryGetValue("PinID", out var pid) ? pid.S ?? "" : "";
    return new LatestDesignEmailInfo(designId, albumId, nPage, title, pinId);
}

static string BuildPatternUrl(PatternLinkHelper linkHelper, LatestDesignEmailInfo latestDesign)
{
    string caption = (latestDesign.Title ?? "Cross-stitch-pattern").Replace(' ', '-');
    int.TryParse(latestDesign.NPage, out int nPage);
    return $"{linkHelper.SiteBaseUrl}/{caption}-{latestDesign.AlbumId}-{nPage - 1}-Free-Design.aspx";
}

static string BuildUnsubscribeUrl(PatternLinkHelper linkHelper, string token)
{
    string? configuredBaseUrl = ConfigurationManager.AppSettings["UnsubscribeBaseUrl"];
    string baseUrl = !string.IsNullOrWhiteSpace(configuredBaseUrl) ? configuredBaseUrl.TrimEnd('/') : $"{linkHelper.SiteBaseUrl}/unsubscribe";
    return $"{baseUrl}?token={Uri.EscapeDataString(token)}";
}

static EmailTemplateDefinition LoadHtmlEmailTemplate()
{
    const string HtmlEmailTemplatePathDefault = "Templates\\HtmlEmailTemplate.txt";
    string[] requiredSections = { "Subject", "Greeting", "BeforeImage", "ImageWithLink", "AfterImage", "Unsubscribe", "Closing", "Signature" };
    string configuredPath = ConfigurationManager.AppSettings["HtmlEmailTemplatePath"] ?? HtmlEmailTemplatePathDefault;
    string resolvedPath = ResolveTemplatePath(configuredPath);
    if (!File.Exists(resolvedPath))
        throw new FileNotFoundException($"Email template file was not found: {resolvedPath}", resolvedPath);

    var sections = ParseTemplateSections(File.ReadAllText(resolvedPath), resolvedPath);
    foreach (var required in requiredSections)
    {
        if (!sections.TryGetValue(required, out var value) || string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"Email template section '{required}' is missing or empty in {resolvedPath}.");
    }
    return new EmailTemplateDefinition(resolvedPath, sections);
}

static string ResolveTemplatePath(string templatePath)
{
    templatePath = ExpandCrossStitchToken(templatePath);
    return Path.IsPathRooted(templatePath) ? templatePath : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, templatePath);
}

static string ExpandCrossStitchToken(string path)
{
    const string token = "%CROSS_STITCH%";
    if (string.IsNullOrEmpty(path) || path.IndexOf(token, StringComparison.OrdinalIgnoreCase) < 0)
        return path;
    string? root = Environment.GetEnvironmentVariable("CROSS_STITCH");
    if (string.IsNullOrWhiteSpace(root)) root = @"D:\ann\Git";
    return path.Replace(token, root, StringComparison.OrdinalIgnoreCase);
}

static Dictionary<string, string> ParseTemplateSections(string content, string sourcePath)
{
    var sections = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    string? currentSection = null;
    var buffer = new System.Text.StringBuilder();

    using var reader = new StringReader(content);
    string? line;
    while ((line = reader.ReadLine()) != null)
    {
        string trimmed = line.Trim();
        if (trimmed.Length >= 3 && trimmed.StartsWith("[", StringComparison.Ordinal) && trimmed.EndsWith("]", StringComparison.Ordinal))
        {
            string sectionName = trimmed.Substring(1, trimmed.Length - 2).Trim();
            if (sectionName.Length > 0)
            {
                CommitSection(sections, currentSection, buffer, sourcePath);
                currentSection = sectionName;
                buffer.Clear();
                continue;
            }
        }
        if (currentSection == null) continue;
        if (buffer.Length > 0) buffer.AppendLine();
        buffer.Append(line);
    }
    CommitSection(sections, currentSection, buffer, sourcePath);

    if (sections.Count == 0)
        throw new InvalidOperationException($"Email template file {sourcePath} does not contain any sections.");
    return sections;
}

static void CommitSection(IDictionary<string, string> sections, string? sectionName, System.Text.StringBuilder buffer, string sourcePath)
{
    if (string.IsNullOrWhiteSpace(sectionName)) return;
    if (sections.ContainsKey(sectionName))
        throw new InvalidOperationException($"Email template file {sourcePath} contains duplicate section '{sectionName}'.");
    sections[sectionName] = buffer.ToString().Trim();
}

static Dictionary<string, string> CreateCommonTemplateReplacements(string? firstName)
{
    string userName = string.IsNullOrWhiteSpace(firstName) ? "Friend" : firstName.Trim();
    return new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["<username>"] = userName,
        ["[FName]"] = userName,
        ["[Fname]"] = userName,
        ["[fname]"] = userName,
        ["[Recipient's Name]"] = userName,
        ["[Recipient\u2019s Name]"] = userName,
    };
}

static string ReplaceTemplateTokens(string templateValue, IReadOnlyDictionary<string, string> replacements)
{
    string rendered = templateValue;
    foreach (var pair in replacements)
        rendered = rendered.Replace(pair.Key, pair.Value, StringComparison.Ordinal);
    return rendered;
}

static string RenderOptionalTemplateSection(string templateValue, IReadOnlyDictionary<string, string> replacements, string? requiredPlaceholderValue)
{
    if (string.IsNullOrWhiteSpace(requiredPlaceholderValue)) return string.Empty;
    return ReplaceTemplateTokens(templateValue, replacements);
}

static string JoinTextSections(params string[] sections) =>
    string.Join("\r\n\r\n", sections.Where(s => !string.IsNullOrWhiteSpace(s)));

static string JoinHtmlSections(params string[] sections) =>
    string.Concat(sections.Where(s => !string.IsNullOrWhiteSpace(s)).Select(ConvertPlainTextToHtml));

static string ConvertPlainTextToHtml(string text)
{
    if (string.IsNullOrWhiteSpace(text)) return string.Empty;
    var normalized = text.Replace("\r\n", "\n").Replace("\r", "\n");
    var paragraphs = normalized.Split(new[] { "\n\n" }, StringSplitOptions.None);
    var htmlParagraphs = paragraphs
        .Select(p => WebUtility.HtmlEncode(p).Replace("\n", "<br/>"))
        .Where(p => !string.IsNullOrWhiteSpace(p));
    return string.Join(string.Empty, htmlParagraphs.Select(p => $"<p>{p}</p>"));
}

static string RenderHtmlSignature(string signature, string? siteUrl)
{
    if (string.IsNullOrWhiteSpace(signature)) return string.Empty;
    if (string.IsNullOrWhiteSpace(siteUrl)) return ConvertPlainTextToHtml(signature);
    return $"<p><a href=\"{WebUtility.HtmlEncode(siteUrl)}\">{WebUtility.HtmlEncode(signature)}</a></p>";
}

static RenderedEmailContent RenderHtmlEmailContent(
    EmailTemplateDefinition template, string? firstName, string patternUrl, string? siteUrl, string imageUrl, string altText, string? unsubscribeUrl)
{
    var replacements = CreateCommonTemplateReplacements(firstName);
    replacements["<pattern_url>"] = patternUrl ?? string.Empty;
    replacements["<image_url>"] = imageUrl ?? string.Empty;
    replacements["<alt_text>"] = altText ?? string.Empty;
    replacements["<unsubscribe_url>"] = unsubscribeUrl ?? string.Empty;

    string subject = ReplaceTemplateTokens(template.GetRequiredSection("Subject"), replacements);
    string greeting = ReplaceTemplateTokens(template.GetRequiredSection("Greeting"), replacements);
    string beforeImage = ReplaceTemplateTokens(template.GetRequiredSection("BeforeImage"), replacements);
    string imageWithLink = RenderOptionalTemplateSection(template.GetRequiredSection("ImageWithLink"), replacements, imageUrl);
    string afterImage = ReplaceTemplateTokens(template.GetRequiredSection("AfterImage"), replacements);
    string unsubscribe = RenderOptionalTemplateSection(template.GetRequiredSection("Unsubscribe"), replacements, unsubscribeUrl);
    string closing = ReplaceTemplateTokens(template.GetRequiredSection("Closing"), replacements);
    string signature = ReplaceTemplateTokens(template.GetRequiredSection("Signature"), replacements);
    string signatureHtml = RenderHtmlSignature(signature, siteUrl);

    string textBody = JoinTextSections(
        greeting, beforeImage,
        string.IsNullOrWhiteSpace(patternUrl) ? string.Empty : $"View the design: {patternUrl}",
        afterImage, unsubscribe, closing, signature);
    string htmlBody = JoinHtmlSections(greeting, beforeImage) + imageWithLink + JoinHtmlSections(afterImage, unsubscribe, closing) + signatureHtml;

    return new RenderedEmailContent(subject, textBody, htmlBody);
}

static string AppendTrackingParameters(string url, string? cid, string? eid)
{
    if (string.IsNullOrWhiteSpace(url)) return url;
    var queryParts = new List<string>();
    if (!string.IsNullOrWhiteSpace(cid)) queryParts.Add($"cid={Uri.EscapeDataString(cid)}");
    if (!string.IsNullOrWhiteSpace(eid)) queryParts.Add($"eid={Uri.EscapeDataString(eid)}");
    string trackedUrl = queryParts.Count == 0 ? url : AppendQueryParameters(url, queryParts);
    return AppendUtmParameters(trackedUrl);
}

static string AppendUtmParameters(string url)
{
    if (string.IsNullOrWhiteSpace(url)) return url;
    var queryParts = new List<string>();
    if (!HasQueryParameter(url, "utm_source")) queryParts.Add("utm_source=newsletter");
    if (!HasQueryParameter(url, "utm_medium")) queryParts.Add("utm_medium=email");
    if (!HasQueryParameter(url, "utm_campaign"))
        queryParts.Add($"utm_campaign={Uri.EscapeDataString(DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))}");
    return queryParts.Count == 0 ? url : AppendQueryParameters(url, queryParts);
}

static bool HasQueryParameter(string url, string parameterName)
{
    if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(parameterName)) return false;
    int queryIndex = url.IndexOf('?');
    if (queryIndex < 0) return false;
    string query = url.Substring(queryIndex + 1);
    int hashIndex = query.IndexOf('#');
    if (hashIndex >= 0) query = query.Substring(0, hashIndex);
    foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
        int eqIndex = part.IndexOf('=');
        string name = eqIndex >= 0 ? part.Substring(0, eqIndex) : part;
        if (string.Equals(name, parameterName, StringComparison.OrdinalIgnoreCase)) return true;
    }
    return false;
}

static string AppendQueryParameters(string url, IReadOnlyList<string> parameters)
{
    if (string.IsNullOrWhiteSpace(url) || parameters == null || parameters.Count == 0) return url;
    string fragment = string.Empty;
    string baseUrl = url;
    int hashIndex = url.IndexOf('#');
    if (hashIndex >= 0)
    {
        fragment = url.Substring(hashIndex);
        baseUrl = url.Substring(0, hashIndex);
    }
    string separator = baseUrl.Contains("?") ? "&" : "?";
    return $"{baseUrl}{separator}{string.Join("&", parameters)}{fragment}";
}

// ---------------- send-newsletter (mirrors MainWindow.xaml.cs's SendNotificationEmailsAsync /
// FetchAllUserEmailsAsync / SendNotificationMailToUsersAsync / SendEmailsWithProgressAsync) ----------------

static async Task SendNewsletterAsync(int months, bool autoYes)
{
    string? sender = ConfigurationManager.AppSettings["SenderEmail"];
    string? admin = ConfigurationManager.AppSettings["AdminEmail"];
    if (string.IsNullOrEmpty(sender))
        throw new InvalidOperationException("SenderEmail must be configured.");

    var dynamoDbClient = new AmazonDynamoDBClient();
    var sesClient = new AmazonSimpleEmailServiceClient();
    var emailHelper = new EmailHelper();
    var linkHelper = HelperFactory.CreatePatternLinkHelper();
    string? sesConfigurationSetName = ConfigurationManager.AppSettings["SesConfigurationSetName"];
    string usersTable = ConfigurationManager.AppSettings["UsersTableName"] ?? "CrossStitchUsers";
    string emailAttribute = ConfigurationManager.AppSettings["UserEmailAttribute"] ?? "Email";
    string userIdAttribute = ConfigurationManager.AppSettings["UserIdAttribute"] ?? "ID";

    var latestDesign = await GetLatestDesignEmailInfoAsync(dynamoDbClient);
    Console.WriteLine($"Latest design: DesignID {latestDesign.DesignId}, AlbumID {latestDesign.AlbumId}, \"{latestDesign.Title}\"");

    DateTime cutoffUtc = DateTime.UtcNow.AddMonths(-months);
    Console.WriteLine($"Filter: verified + subscribed + visited (LastSeenAt) since {cutoffUtc:yyyy-MM-dd}");

    var allRecipients = await FetchAllUserEmailsAsync(dynamoDbClient, onlyVerified: true, onlySubscribed: true, minLastSeenAtUtc: cutoffUtc);
    var eligibleRecipients = allRecipients.Where(r => !string.IsNullOrWhiteSpace(r.UnsubscribeToken)).ToList();
    int skippedNoToken = allRecipients.Count - eligibleRecipients.Count;

    var toSend = admin == null
        ? eligibleRecipients
        : eligibleRecipients.Where(r => !string.Equals(r.Email, admin, StringComparison.OrdinalIgnoreCase)).ToList();

    Console.WriteLine($"Matched: {allRecipients.Count} (verified+subscribed+recently-visited)");
    Console.WriteLine($"Skipped (no unsubscribe token): {skippedNoToken}");
    Console.WriteLine($"Will send to: {toSend.Count} recipient(s), plus 1 admin copy to {admin}");

    if (!autoYes)
    {
        Console.Write($"Type 'yes' to send this to {toSend.Count} real recipients: ");
        string? answer = Console.ReadLine();
        if (!string.Equals(answer?.Trim(), "yes", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine("Aborted. Nothing was sent.");
            return;
        }
    }

    var template = LoadHtmlEmailTemplate();
    string patternUrl = BuildPatternUrl(linkHelper, latestDesign);
    string imageUrl = linkHelper.BuildImageUrl(latestDesign.DesignId, latestDesign.AlbumId);
    string altText = string.IsNullOrWhiteSpace(latestDesign.Title) ? "New cross stitch pattern" : latestDesign.Title;
    string eid = DateTime.UtcNow.ToString("yyMMdd", CultureInfo.InvariantCulture);

    if (!string.IsNullOrEmpty(admin))
    {
        string adminSiteUrl = AppendTrackingParameters(linkHelper.SiteBaseUrl, "admin", eid);
        var adminContent = RenderHtmlEmailContent(template, "admin", AppendUtmParameters(patternUrl), adminSiteUrl, imageUrl, altText, null);
        await emailHelper.SendEmailAsync(sesClient, sender, new[] { admin }, adminContent.Subject, adminContent.TextBody, adminContent.HtmlBody, configurationSetName: sesConfigurationSetName);
        Console.WriteLine($"Sent admin copy to {admin}.");
    }

    var stopwatch = Stopwatch.StartNew();
    int sent = 0;
    foreach (var recipient in toSend)
    {
        string cid = recipient.Cid ?? string.Empty;
        string patternUrlWithTracking = AppendTrackingParameters(patternUrl, cid, eid);
        string siteUrlWithTracking = AppendTrackingParameters(linkHelper.SiteBaseUrl, cid, eid);
        string unsubscribeUrl = BuildUnsubscribeUrl(linkHelper, recipient.UnsubscribeToken!);
        var unsubscribeHeaders = BuildUnsubscribeHeaders(unsubscribeUrl, sender);

        var content = RenderHtmlEmailContent(LoadHtmlEmailTemplate(), recipient.FirstName, patternUrlWithTracking, siteUrlWithTracking, imageUrl, altText, unsubscribeUrl);
        await emailHelper.SendEmailAsync(sesClient, sender, new[] { recipient.Email }, content.Subject, content.TextBody, content.HtmlBody, unsubscribeHeaders, sesConfigurationSetName);

        try
        {
            await UpdateLastEmailDateAsync(dynamoDbClient, recipient, usersTable, emailAttribute, userIdAttribute);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to update LastEmailDate for {recipient.Email}: {ex.Message}");
        }

        sent++;
        if (sent % 50 == 0 || sent == toSend.Count)
            Console.WriteLine($"Sent {sent}/{toSend.Count} | Elapsed {stopwatch.Elapsed:hh\\:mm\\:ss}");
    }

    Console.WriteLine($"Done. Sent {sent}/{toSend.Count} in {stopwatch.Elapsed:hh\\:mm\\:ss}.");
}

static Dictionary<string, string> BuildUnsubscribeHeaders(string unsubscribeUrl, string sender)
{
    string mailto = $"mailto:{sender}";
    return new Dictionary<string, string>
    {
        { "List-Unsubscribe", $"<{mailto}>, <{unsubscribeUrl}>" },
        { "List-Unsubscribe-Post", "List-Unsubscribe=One-Click" },
    };
}

static async Task UpdateLastEmailDateAsync(AmazonDynamoDBClient client, UserRecipient recipient, string usersTable, string emailAttribute, string userIdAttribute)
{
    var key = new Dictionary<string, AttributeValue>();
    if (recipient.IdAttribute != null)
        key[userIdAttribute] = recipient.IdAttribute;
    else
        key[emailAttribute] = new AttributeValue { S = recipient.Email };

    await client.UpdateItemAsync(new UpdateItemRequest
    {
        TableName = usersTable,
        Key = key,
        UpdateExpression = "SET LastEmailDate = :now",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":now"] = new AttributeValue { S = DateTime.UtcNow.ToString("o") } },
    });
}

static async Task<List<UserRecipient>> FetchAllUserEmailsAsync(
    AmazonDynamoDBClient client, bool onlyVerified = false, bool onlySubscribed = false, DateTime? minLastSeenAtUtc = null)
{
    string usersTable = ConfigurationManager.AppSettings["UsersTableName"] ?? "CrossStitchUsers";
    string emailAttribute = ConfigurationManager.AppSettings["UserEmailAttribute"] ?? "Email";
    string firstNameAttribute = ConfigurationManager.AppSettings["UserFirstNameAttribute"] ?? "FirstName";
    string userIdAttribute = ConfigurationManager.AppSettings["UserIdAttribute"] ?? "ID";
    string userCidAttribute = ConfigurationManager.AppSettings["UserCidAttribute"] ?? "cid";
    string verifiedAttribute = ConfigurationManager.AppSettings["UserVerifiedAttribute"] ?? "Verified";
    string unsubscribedAttribute = ConfigurationManager.AppSettings["UserUnsubscribedAttribute"] ?? "Unsubscribed";
    string botSuspectAttribute = ConfigurationManager.AppSettings["UserBotSuspectAttribute"] ?? "BotSuspect";
    const string unsubscribeTokenAttribute = "UnsubscribeToken";
    const string lastSeenAtAttribute = "LastSeenAt";

    var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var recipients = new List<UserRecipient>();

    var projectionParts = new List<string> { emailAttribute, firstNameAttribute, userIdAttribute, userCidAttribute, unsubscribeTokenAttribute, botSuspectAttribute };
    if (onlyVerified) projectionParts.Add(verifiedAttribute);
    if (onlySubscribed) projectionParts.Add(unsubscribedAttribute);
    if (minLastSeenAtUtc.HasValue) projectionParts.Add(lastSeenAtAttribute);

    var scanRequest = new ScanRequest { TableName = usersTable, ProjectionExpression = string.Join(", ", projectionParts.Distinct()) };
    Dictionary<string, AttributeValue>? lastEvaluatedKey = null;

    do
    {
        scanRequest.ExclusiveStartKey = lastEvaluatedKey;
        var response = await client.ScanAsync(scanRequest);

        foreach (var item in response.Items)
        {
            if (!item.TryGetValue(emailAttribute, out var emailAttr)) continue;
            string? email = !string.IsNullOrWhiteSpace(emailAttr.S) ? emailAttr.S.Trim() : null;
            if (string.IsNullOrWhiteSpace(email)) continue;
            if (!emails.Add(email)) continue;

            string? firstName = item.TryGetValue(firstNameAttribute, out var fn) && !string.IsNullOrWhiteSpace(fn.S) ? fn.S.Trim() : null;
            AttributeValue? idAttr = item.TryGetValue(userIdAttribute, out var idValue) ? idValue : null;
            string? cid = item.TryGetValue(userCidAttribute, out var cidAttr) && !string.IsNullOrWhiteSpace(cidAttr.S) ? cidAttr.S.Trim() : null;

            bool isBotSuspect = item.TryGetValue(botSuspectAttribute, out var botAttr) && botAttr.BOOL;
            if (isBotSuspect) continue;

            if (onlyVerified)
            {
                bool isVerified = item.TryGetValue(verifiedAttribute, out var verifiedAttr) && verifiedAttr.BOOL;
                if (!isVerified) continue;
            }
            if (onlySubscribed)
            {
                bool unsubscribed = item.TryGetValue(unsubscribedAttribute, out var unsubAttr) && unsubAttr.BOOL;
                if (unsubscribed) continue;
            }
            if (minLastSeenAtUtc.HasValue &&
                !(TryGetDateTimeAttributeUtc(item, lastSeenAtAttribute, out DateTime lastSeenAtUtc) && lastSeenAtUtc >= minLastSeenAtUtc.Value))
            {
                continue;
            }

            string? unsubscribeToken = item.TryGetValue(unsubscribeTokenAttribute, out var tokenAttr) && !string.IsNullOrWhiteSpace(tokenAttr.S) ? tokenAttr.S.Trim() : null;
            recipients.Add(new UserRecipient(email, firstName, idAttr, cid, unsubscribeToken));
        }

        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey != null && lastEvaluatedKey.Count > 0);

    return recipients;
}

static bool TryGetDateTimeAttributeUtc(IReadOnlyDictionary<string, AttributeValue> item, string attributeName, out DateTime valueUtc)
{
    valueUtc = default;
    if (!item.TryGetValue(attributeName, out var attributeValue) || string.IsNullOrWhiteSpace(attributeValue?.S))
        return false;

    string rawValue = attributeValue.S.Trim();
    if (DateTimeOffset.TryParse(rawValue, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTimeOffset dto))
    {
        valueUtc = dto.UtcDateTime;
        return true;
    }
    if (DateTime.TryParse(rawValue, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTime parsed))
    {
        valueUtc = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return true;
    }
    return false;
}

sealed record UserRecipient(string Email, string? FirstName, AttributeValue? IdAttribute, string? Cid, string? UnsubscribeToken);

sealed class EmailTemplateDefinition
{
    public EmailTemplateDefinition(string sourcePath, Dictionary<string, string> sections)
    {
        SourcePath = sourcePath;
        Sections = sections;
    }
    public string SourcePath { get; }
    public Dictionary<string, string> Sections { get; }
    public string GetRequiredSection(string sectionName)
    {
        if (!Sections.TryGetValue(sectionName, out var value) || string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"Template section '{sectionName}' is missing or empty in {SourcePath}.");
        return value;
    }
}

sealed class RenderedEmailContent
{
    public RenderedEmailContent(string subject, string textBody, string? htmlBody)
    {
        Subject = subject;
        TextBody = textBody;
        HtmlBody = htmlBody;
    }
    public string Subject { get; }
    public string TextBody { get; }
    public string? HtmlBody { get; }
}

sealed record LatestDesignEmailInfo(int DesignId, int AlbumId, string NPage, string Title, string PinId);
