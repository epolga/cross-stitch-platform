// Headless equivalent of MainWindow.xaml.cs's "Select folder" + "Upload"
// button flow, for batch folders that don't need the WPF UI. Reuses the real
// PatternInfo / HelperFactory / ElasticBeanstalkHelper / SeoTextGenerator
// classes from Uploader.csproj (ProjectReference) rather than re-implementing
// them, so this stays faithful to the actual app instead of a copy that can
// drift out of sync.
//
// Usage: UploaderCli <batchFolderPath> [--yes]
//   --yes   skip the confirmation prompt before the irreversible steps
//           (Pinterest pin creation + DynamoDB insert). Without it, the tool
//           prints exactly what it's about to do and waits for "yes".

using System.Configuration;
using System.Diagnostics;
using Amazon;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.S3;
using Amazon.S3.Transfer;
using CrossStitch.Shared.Pinterest;
using UploadPatterns;
using Uploader.Helpers;

const string ConverterExePath = @"D:\ann\Git\Converter\bin\Release\net9.0\Converter.exe";
const string PhotoPrefix = "photos";
const string PinterestPhotoFileName = "4_pinterest.jpg";

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: UploaderCli <batchFolderPath> [--yes]");
    return 2;
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
