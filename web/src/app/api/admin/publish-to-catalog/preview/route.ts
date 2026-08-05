// Lightweight lookup for the "Publish to Catalog" dialog's preview: given an
// Album ID, resolves the album's caption and its mapped Pinterest board —
// both need server-side access (DynamoDB, and the AlbumBoards.csv file),
// neither of which the dialog can reach directly.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getAlbumCaption } from '@/lib/design-sequencing';
import { getBoardIdForAlbum } from '@/lib/pinterest-boards';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const albumIdStr = request.nextUrl.searchParams.get('albumId');
  const albumId = albumIdStr ? parseInt(albumIdStr, 10) : NaN;
  if (!albumId || albumId <= 0) {
    return NextResponse.json({ error: 'Valid albumId query param required' }, { status: 400 });
  }

  const [albumCaption, boardId] = await Promise.all([
    getAlbumCaption(albumId),
    Promise.resolve(getBoardIdForAlbum(albumId)),
  ]);

  return NextResponse.json({ albumId, albumCaption, boardId });
}
