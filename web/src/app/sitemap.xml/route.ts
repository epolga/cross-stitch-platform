// Place this file at src/app/sitemap.xml/route.ts in your Next.js project.
// This will serve the sitemap at /sitemap.xml (e.g., https://example.com/sitemap.xml).
// Install required packages if not already: npm install sitemap @aws-sdk/client-s3
// Ensure your environment variables include AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or use IAM roles on Elastic Beanstalk), and S3_BUCKET_NAME.
// The sitemap is generated dynamically using your existing DataAccess functions to fetch all albums and designs.
// It caches the generated XML in S3 for 1 hour to reduce load on DynamoDB, suitable for multi-instance Elastic Beanstalk deployments.
// If your total URLs exceed 50,000 in the future, consider splitting into an index with subsidiary sitemaps via additional routes.
// The base URL is now derived dynamically from the incoming request headers for flexibility across environments.

import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getAllAlbumCaptions, fetchAllDesigns } from '@/lib/data-access';
import { Design } from '../types/design';
import { CreateAlbumUrl, CreateDesignUrl, getSiteBaseUrl, normalizeBaseUrl } from '@/lib/url-helper';

export const dynamic = 'force-dynamic';

// Define AWS error interface to avoid using 'any'
interface AwsError extends Error {
  $metadata?: {
    httpStatusCode?: number;
  };
}

function isAwsError(error: unknown): error is AwsError {
  return error instanceof Error && '$metadata' in error;
}

function resolveBaseUrl(request: Request): string {
  const host = request.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') || host.startsWith('127.')
      ? 'http'
      : request.headers.get('x-forwarded-proto') || 'https';
    return normalizeBaseUrl(`${protocol}://${host}`);
  }
  return getSiteBaseUrl();
}

// Initialize S3 client (credentials managed via environment variables or IAM role)
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_KEY = 'sitemap.xml';
const CACHE_TTL_SECONDS = 3600; // 1 hour - adjust as needed

// Function to generate the sitemap XML
async function generateAndUploadSitemap(baseUrl: string) {
  // Static URLs
  const staticUrls = [
    { url: '/', changefreq: 'weekly', priority: 1.0, lastmod: new Date().toISOString() },
    { url: '/XStitch-Charts.aspx', changefreq: 'daily', priority: 0.8, lastmod: new Date().toISOString() },
    { url: '/Embroidery_History.aspx', changefreq: 'monthly', priority: 0.5, lastmod: new Date().toISOString() },
    { url: '/WhyCrossStitch', changefreq: 'monthly', priority: 0.5, lastmod: new Date().toISOString() },
    { url: '/Article070409.aspx', changefreq: 'monthly', priority: 0.5, lastmod: new Date().toISOString() },
    { url: '/exercises', changefreq: 'monthly', priority: 0.5, lastmod: new Date().toISOString() },
    { url: '/short-stories', changefreq: 'monthly', priority: 0.4, lastmod: new Date().toISOString() },
    { url: '/privacy-policy', changefreq: 'yearly', priority: 0.3, lastmod: new Date().toISOString() },
  ];

  // Fetch album URLs
  const albums = (await getAllAlbumCaptions()) || [];

  const albumUrls = albums.map(album => ({
    url: CreateAlbumUrl(album.Caption),
    changefreq: 'monthly',
    priority: 0.6,
    lastmod: new Date().toISOString(),
  }));

   
  // Fetch design URLs (set pageSize large enough to retrieve all in one call)
  let designs : Design[] = [];
  try {
    designs = await fetchAllDesigns();
  } catch (error) {
    console.error('Error fetching designs:', error);
     
  }

  const designUrls = designs.map(design => ({
    url: CreateDesignUrl(design),
    changefreq: 'monthly',
    priority: 0.6,
    lastmod: new Date().toISOString(),
  }));

  // Create sitemap stream (single file since total URLs are manageable)
  const smStream = new SitemapStream({ hostname: baseUrl });
  staticUrls.forEach(url => smStream.write(url));
  albumUrls.forEach(url =>  smStream.write(url));
  designUrls.forEach(url => smStream.write(url));
  smStream.end();

  // Convert stream to XML string
  const xml = await streamToPromise(Readable.from(smStream)).then(data => data.toString());

  // Upload to S3 with metadata for expiration
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: S3_KEY,
    Body: xml,
    ContentType: 'application/xml',
    Metadata: {
      'generated-at': Date.now().toString(),
    },
  }));

  return xml;
}

// Function to retrieve sitemap from S3 or regenerate if expired/missing
async function getSitemap(baseUrl: string) {
  try {
    // Check object metadata
    const headResponse = await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: S3_KEY,
    }));

    const generatedAtStr = headResponse.Metadata?.['generated-at'];
    const generatedAt = generatedAtStr ? parseInt(generatedAtStr, 10) : 0;
    const ageSeconds = (Date.now() - generatedAt) / 1000;
    
    if (ageSeconds < CACHE_TTL_SECONDS) {
      // Fetch from S3
      const getResponse = await s3Client.send(new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: S3_KEY,
      }));
      if (!getResponse.Body) {
        throw new Error('No body in S3 response');
      }
      return await getResponse.Body.transformToString();
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name !== 'NoSuchKey' && (isAwsError(error) ? error.$metadata?.httpStatusCode !== 404 : true)) {
      console.error('S3 error:', error);
    }
  }

  // Regenerate and upload if expired or missing
  return await generateAndUploadSitemap(baseUrl);
}

// Route handler for GET /sitemap.xml
export async function GET(request: Request) {
  const requiredEnvVars = [
    "AWS_REGION",
    "S3_BUCKET_NAME",
  ];
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error(`Missing environment variables: ${missingVars.join(", ")}`);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
 <error>Missing environment variables: ${missingVars.join(", ")}</error>`,
      {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
  try {
    const baseUrl = resolveBaseUrl(request);
    const xml = await getSitemap(baseUrl);
    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Error serving sitemap:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
