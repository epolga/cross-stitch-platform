import { NextRequest, NextResponse } from 'next/server';
import { getDesigns } from '@/lib/data-access';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageSize = parseInt(searchParams.get("pageSize") || "10");
  const nPage = parseInt(searchParams.get("nPage") || "1");

  
  try {
    // Fetch designs using dataAccess
    const responseData = await getDesigns(pageSize, nPage);
    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("Error fetching designs:", error);
    return NextResponse.json(
      { error: `Failed to fetch designs: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}