// Creates a real Pinterest pin for a newly-published design. Ported from
// shared/src/CrossStitch.Shared/Pinterest/PinterestUploader.cs's
// UploadPinForPatternAsync (board resolution, SEO text, v5 POST) — this is
// the first write-capable Pinterest client in the TS codebase;
// automation/pinterest-agent's pinterestClient.ts is read-only.

import { getValidPinterestAccessToken } from '@/lib/pinterest-token';
import { getBoardIdForAlbum } from '@/lib/pinterest-boards';
import { buildPinSeoText, type PinPatternInfo } from '@/lib/pinterest-theme';
import { buildCanonicalUrl } from '@/lib/url-helper';

const PINTEREST_API_BASE_URL = 'https://api.pinterest.com/v5';
const IMAGE_BASE_URL = 'https://cross-stitch-designs.s3.us-east-1.amazonaws.com';
const PHOTO_PREFIX = 'photos';

export class PinterestApiError extends Error {
  constructor(public status: number, body: string) {
    super(`Pinterest API HTTP ${status}: ${body}`);
  }
}

export interface CreatePinInput {
  pattern: PinPatternInfo;
  albumId: number;
  designId: number;
  nPage: number; // 1-based sequential page number for this album
  photoFileName?: string; // defaults to "4.jpg", same file uploaded to S3
}

export interface CreatePinResult {
  pinId: string;
  boardId: string;
  title: string;
  description: string;
  patternUrl: string;
  imageUrl: string;
}

function buildImageUrl(albumId: number, designId: number, photoFileName: string): string {
  return `${IMAGE_BASE_URL}/${PHOTO_PREFIX}/${albumId}/${designId}/${photoFileName}`;
}

function buildPatternUrl(pattern: PinPatternInfo, albumId: number, nPage: number): string {
  const caption = (pattern.title.trim() || 'Cross-stitch-pattern').replace(/ /g, '-');
  return buildCanonicalUrl(`/${caption}-${albumId}-${nPage - 1}-Free-Design.aspx`);
}

export async function createPinterestPin(input: CreatePinInput): Promise<CreatePinResult> {
  const { pattern, albumId, designId, nPage, photoFileName = '4.jpg' } = input;

  const boardId = getBoardIdForAlbum(albumId);
  if (!boardId) {
    throw new Error(`No Pinterest board mapped for album ${albumId} in AlbumBoards.csv.`);
  }

  const patternUrl = buildPatternUrl(pattern, albumId, nPage);
  const imageUrl = buildImageUrl(albumId, designId, photoFileName);
  const seo = buildPinSeoText(pattern);

  const accessToken = await getValidPinterestAccessToken();

  const payload = {
    board_id: boardId,
    link: patternUrl,
    title: seo.title,
    description: seo.description,
    alt_text: seo.altText,
    media_source: {
      source_type: 'image_url',
      url: imageUrl,
    },
  };

  const res = await fetch(`${PINTEREST_API_BASE_URL}/pins`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new PinterestApiError(res.status, bodyText);
  }

  const parsed = JSON.parse(bodyText) as { id?: string };
  if (!parsed.id) {
    throw new PinterestApiError(res.status, `Pin created but response had no id. Body: ${bodyText}`);
  }

  return {
    pinId: parsed.id,
    boardId,
    title: seo.title,
    description: seo.description,
    patternUrl,
    imageUrl,
  };
}
