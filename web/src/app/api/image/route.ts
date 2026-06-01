import { NextRequest, NextResponse } from 'next/server';
import { getDesignPhotoUrlById } from '@/lib/data-access'; // Adjust path if needed

// Helper to parse image slug (e.g., '104-5351-4.jpg')
function parseSlugForImage(slug: string): { designId: string } | null {
  if (!slug.endsWith('.jpg')) {
    return null;
  }
  const baseSlug = slug.replace('.jpg', '');
  const parts = baseSlug.split('-');
  if (parts.length < 4) {
    return null;
  }
  const designId = parts[parts.length - 2]; // Adjust index based on exact format (e.g., parts[1] for '104-5351-4')
  if (!designId || isNaN(parseInt(designId))) {
    return null;
  }
  return { designId };
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.pathname.split('/').pop() || ''; // Extract slug from path

  console.log("GetDesignPhotoUrlFromSlug called with slug:", slug);

  const parsed = parseSlugForImage(slug);
  const designId = parsed?.designId;

  if (!designId) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 404 });
  }

  const url = await getDesignPhotoUrlById(parseInt(designId));
  console.log("Design photo URL:", url);

  if (!url) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  try {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
    }

    // Stream the image content
    return new NextResponse(imageResponse.body, {
      status: imageResponse.status,
      headers: {
        'Content-Type': imageResponse.headers.get('Content-Type') || 'image/jpeg',
        'Content-Length': imageResponse.headers.get('Content-Length') || '',
        // Optional: Add caching, e.g., 'Cache-Control': 'public, max-age=3600'
      },
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}