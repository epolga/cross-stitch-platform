import type { Design } from '@/app/types/design';

const CAPTION_STOP_WORDS = new Set([
  'a','an','the','of','in','on','at','for','to','with','and','or','but',
  'is','are','was','were','free','cross','stitch','pattern','design','chart',
  'tall','small','big','large','little','mini','modern','classic','simple',
  'easy','cute','pretty','tiny','sitting','standing','running','flying','fun',
  'new','old','vintage','beautiful',
]);

const ALBUM_PRIORITY_KEYWORDS = [
  'bookmark','christmas','animal','bird','flower','cat','dog','holiday',
  'farm','ocean','sea','forest','floral','butterfly','bear','rabbit',
];

export function getRelatedLinks(
  design: Design,
  albumCaption: string | undefined,
  allAlbums: { albumId: number; Caption: string }[]
): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];

  // 1. Parent album
  if (albumCaption) {
    links.push({
      label: albumCaption,
      href: `/Free-${albumCaption.replace(/\s+/g, '-')}-Charts.aspx`,
    });
  }

  // 2. Significant words from caption → keyword search links
  const keywords = design.Caption
    .split(/\s+/)
    .filter(w => w.length >= 3 && !CAPTION_STOP_WORDS.has(w.toLowerCase()));
  for (const word of keywords.slice(0, 2)) {
    links.push({
      label: `More ${word} Patterns`,
      href: `/?searchText=${encodeURIComponent(word)}#results`,
    });
  }

  // 3. Related albums (exclude current, prioritize popular themes)
  const others = allAlbums.filter(a => a.albumId !== design.AlbumID);
  const priority = others.filter(a =>
    ALBUM_PRIORITY_KEYWORDS.some(kw => a.Caption.toLowerCase().includes(kw))
  );
  const rest = others.filter(
    a => !ALBUM_PRIORITY_KEYWORDS.some(kw => a.Caption.toLowerCase().includes(kw))
  );
  const related = [...priority, ...rest].slice(0, 2);
  for (const album of related) {
    links.push({
      label: album.Caption,
      href: `/Free-${album.Caption.replace(/\s+/g, '-')}-Charts.aspx`,
    });
  }

  return links;
}
