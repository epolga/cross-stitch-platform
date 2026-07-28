// Place this file at src/app/sitemap.xml/route.ts in your Next.js project.
// This will serve the sitemap at /sitemap.xml (e.g., https://example.com/sitemap.xml).
// Install required packages if not already: npm install sitemap @aws-sdk/client-s3
// Ensure your environment variables include AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or use IAM roles on Elastic Beanstalk), and S3_BUCKET_NAME.
// The sitemap is generated dynamically using your existing DataAccess functions to fetch all albums and designs.
// It caches the generated XML in S3 for 1 hour to reduce load on DynamoDB, suitable for multi-instance Elastic Beanstalk deployments.
// If your total URLs exceed 50,000 in the future, consider splitting into an index with subsidiary sitemaps via additional routes.

import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getAllAlbumCaptions, fetchAllDesigns } from '@/lib/data-access';
import { Design } from '../types/design';
import { CreateAlbumUrl, CreateDesignUrl, getSiteBaseUrl } from '@/lib/url-helper';

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

// Initialize S3 client (credentials managed via environment variables or IAM role)
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_KEY = 'sitemap.xml';
const CACHE_TTL_SECONDS = 3600; // 1 hour - adjust as needed

// Manually maintained per-route date: the day the change actually WENT LIVE
// (the date of the `eb deploy` that shipped it), not the git commit date —
// those can differ if a commit sits undeployed for a while, and the deploy
// date is what actually matches when a crawler would see new content. There's
// no CMS/DB row backing these routes to derive it from automatically.
// Seeded 2026-07-25 from `git log -1 --format=%ad -- <source file>` per route
// as an approximation (commit date, not confirmed deploy date) — good enough
// for pages that rarely change; keep it exact for anything edited from here on.
const STATIC_PAGE_LASTMOD: Record<string, string> = {
  '/': '2026-07-27', // src/app/page.tsx
  '/XStitch-Charts.aspx': '2026-07-07', // src/app/[slug]/page.tsx (shared catch-all)
  '/photo-to-cross-stitch': '2026-07-28', // src/app/photo-to-cross-stitch/page.tsx
  '/Embroidery_History.aspx': '2026-07-07', // src/app/[slug]/page.tsx (shared catch-all)
  '/WhyCrossStitch': '2026-06-01', // src/app/WhyCrossStitch/page.tsx
  '/Article070409.aspx': '2026-07-07', // src/app/[slug]/page.tsx (shared catch-all)
  '/exercises': '2026-06-01', // src/app/exercises/page.tsx
  '/short-stories': '2026-07-08', // src/app/short-stories/page.tsx
  '/privacy-policy': '2026-06-01', // src/app/privacy-policy/page.tsx
  '/dmc-color-chart': '2026-07-27', // src/app/dmc-color-chart/page.tsx
  '/cross-stitch-size-calculator': '2026-07-27', // src/app/cross-stitch-size-calculator/page.tsx
};

// Function to generate the sitemap XML
async function generateAndUploadSitemap(baseUrl: string) {
  // Static URLs
  const staticUrls = [
    { url: '/', changefreq: 'weekly', priority: 1.0, lastmod: STATIC_PAGE_LASTMOD['/'] },
    { url: '/XStitch-Charts.aspx', changefreq: 'daily', priority: 0.8, lastmod: STATIC_PAGE_LASTMOD['/XStitch-Charts.aspx'] },
    { url: '/photo-to-cross-stitch', changefreq: 'monthly', priority: 0.8, lastmod: STATIC_PAGE_LASTMOD['/photo-to-cross-stitch'] },
    { url: '/dmc-color-chart', changefreq: 'monthly', priority: 0.6, lastmod: STATIC_PAGE_LASTMOD['/dmc-color-chart'] },
    { url: '/cross-stitch-size-calculator', changefreq: 'monthly', priority: 0.6, lastmod: STATIC_PAGE_LASTMOD['/cross-stitch-size-calculator'] },
    { url: '/Embroidery_History.aspx', changefreq: 'monthly', priority: 0.5, lastmod: STATIC_PAGE_LASTMOD['/Embroidery_History.aspx'] },
    { url: '/WhyCrossStitch', changefreq: 'monthly', priority: 0.5, lastmod: STATIC_PAGE_LASTMOD['/WhyCrossStitch'] },
    { url: '/Article070409.aspx', changefreq: 'monthly', priority: 0.5, lastmod: STATIC_PAGE_LASTMOD['/Article070409.aspx'] },
    { url: '/exercises', changefreq: 'monthly', priority: 0.5, lastmod: STATIC_PAGE_LASTMOD['/exercises'] },
    { url: '/short-stories', changefreq: 'monthly', priority: 0.4, lastmod: STATIC_PAGE_LASTMOD['/short-stories'] },
    { url: '/privacy-policy', changefreq: 'yearly', priority: 0.3, lastmod: STATIC_PAGE_LASTMOD['/privacy-policy'] },
  ];

  // Fetch album URLs
  const albums = (await getAllAlbumCaptions()) || [];

  // Fetch design URLs (set pageSize large enough to retrieve all in one call)
  let designs : Design[] = [];
  try {
    designs = await fetchAllDesigns();
  } catch (error) {
    console.error('Error fetching designs:', error);

  }

  // Albums have no content-edit path of their own yet, so there's no direct
  // LastModifiedAt for them. Use the most recent LastModifiedAt among the
  // album's own designs instead — a design changing is the closest real
  // signal we have that the album page's content changed. Omitted (not
  // faked as "now") for albums whose designs have no timestamp at all.
  const albumLastmod = new Map<number, string>();
  for (const design of designs) {
    if (!design.LastModifiedAt) continue;
    const current = albumLastmod.get(design.AlbumID);
    if (!current || design.LastModifiedAt > current) {
      albumLastmod.set(design.AlbumID, design.LastModifiedAt);
    }
  }

  const albumUrls = albums.map(album => {
    const lastmod = albumLastmod.get(album.albumId);
    return {
      url: CreateAlbumUrl(album.Caption),
      changefreq: 'monthly',
      priority: 0.6,
      ...(lastmod ? { lastmod } : {}),
    };
  });

  const designUrls = designs.map(design => {
    const imgUrl = design.ImageUrl && /^https?:\/\//.test(design.ImageUrl) ? design.ImageUrl : null;
    return {
      url: CreateDesignUrl(design),
      changefreq: 'monthly' as const,
      priority: 0.6,
      ...(design.LastModifiedAt ? { lastmod: design.LastModifiedAt } : {}),
      ...(imgUrl ? {
        img: [{
          url: imgUrl,
          title: `${design.Caption} cross-stitch pattern`,
          caption: `Free ${design.Caption} cross-stitch pattern${design.Width && design.Height ? ` — ${design.Width}×${design.Height} stitches` : ''}${design.NColors ? `, ${design.NColors} colors` : ''}`,
        }],
      } : {}),
    };
  });

  // Create sitemap stream (single file since total URLs are manageable)
  const smStream = new SitemapStream({ hostname: baseUrl, xmlns: { image: true, news: false, xhtml: false, video: false } });
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
export async function GET() {
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
    const baseUrl = getSiteBaseUrl();
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
