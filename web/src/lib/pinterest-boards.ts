// Album ID -> Pinterest board ID lookup. Reads web/src/data/AlbumBoards.csv,
// a synced copy of the canonical docs/data/AlbumBoards.csv (both Uploader
// and this app read the same 4-digit-AlbumID -> BoardID mapping; this copy
// exists because `eb deploy` only bundles the web/ directory, so the
// original outside web/ isn't reachable at runtime). Update this copy
// manually if the canonical CSV changes — it changes rarely.

import { readFileSync } from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), 'src', 'data', 'AlbumBoards.csv');

let cache: Map<string, string> | null = null;

function parseLine(line: string): { albumId: string; boardId: string } | null {
  const firstComma = line.indexOf(',');
  const lastComma = line.lastIndexOf(',');
  if (firstComma <= 0 || lastComma <= firstComma) return null;

  const albumId = line.slice(0, firstComma).trim();
  let raw = line.slice(lastComma + 1).trim();
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    raw = raw.slice(1, -1);
  }
  if (!albumId || !raw) return null;
  return { albumId, boardId: raw };
}

function loadBoardsMapping(): Map<string, string> {
  const map = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(CSV_PATH, 'utf-8');
  } catch {
    return map;
  }

  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) { // skip header row
    const line = lines[i].trim();
    if (!line) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (!map.has(parsed.albumId)) map.set(parsed.albumId, parsed.boardId);
  }
  return map;
}

// Resolves a numeric album id (e.g. 15) to its Pinterest board id, matching
// against the CSV's zero-padded 4-digit AlbumID column (e.g. "0015").
export function getBoardIdForAlbum(albumId: number): string | null {
  if (!cache) cache = loadBoardsMapping();
  const key = albumId.toString().padStart(4, '0');
  return cache.get(key) ?? null;
}

export function getAlbumBoardsCount(): number {
  if (!cache) cache = loadBoardsMapping();
  return cache.size;
}
