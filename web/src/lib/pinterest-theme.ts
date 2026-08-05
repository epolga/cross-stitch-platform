// Theme detection + Pinterest pin title/description/alt-text builder.
// Ported from shared/src/CrossStitch.Shared/Pinterest/PinterestUploader.cs
// (DetectTheme/BuildPinTitle/BuildPinDescription/BuildAltText/BuildBeginnerHook/
// ToSentenceCase) — same rule-based keyword matching, same wording, so pins
// created from the web admin flow read identically to ones from the desktop
// Uploader.

export interface PinPatternInfo {
  title: string;
  description?: string;
  notes?: string;
  width: number;
  height: number;
  nColors: number;
}

interface Theme {
  code: string;
  humanName: string;
  keywords: string[];
  hashtags: string[];
}

const DEFAULT_THEME: Theme = {
  code: 'general',
  humanName: 'cross stitch pattern',
  keywords: [],
  hashtags: ['#crossstitch', '#crossstitchpattern', '#embroidery', '#needlework'],
};

const THEMES: Theme[] = [
  { code: 'cats', humanName: 'cat cross stitch pattern', keywords: ['cat', 'kitten', 'kitty'], hashtags: ['#cat', '#cats', '#catlover', '#kitty'] },
  { code: 'dogs', humanName: 'dog cross stitch pattern', keywords: ['dog', 'puppy', 'pup'], hashtags: ['#dog', '#dogs', '#doglover', '#puppy'] },
  { code: 'birds', humanName: 'bird cross stitch pattern', keywords: ['bird', 'sparrow', 'owl', 'eagle', 'parrot'], hashtags: ['#birds', '#birdart'] },
  { code: 'flowers', humanName: 'floral cross stitch pattern', keywords: ['flower', 'rose', 'tulip', 'poppy', 'bouquet', 'floral'], hashtags: ['#flowers', '#floral'] },
  { code: 'nature', humanName: 'nature cross stitch pattern', keywords: ['forest', 'tree', 'mountain', 'lake', 'river', 'landscape', 'nature'], hashtags: ['#landscape', '#nature'] },
  { code: 'seaside', humanName: 'seaside cross stitch pattern', keywords: ['sea', 'ocean', 'beach', 'coast', 'harbor', 'harbour'], hashtags: ['#seaside', '#ocean', '#beach'] },
  { code: 'city', humanName: 'city cross stitch pattern', keywords: ['city', 'street', 'house', 'houses', 'architecture', 'building'], hashtags: ['#cityscape', '#architecture'] },
  { code: 'people', humanName: 'people cross stitch pattern', keywords: ['girl', 'boy', 'woman', 'man', 'people', 'portrait'], hashtags: ['#portrait', '#people'] },
  { code: 'fantasy', humanName: 'fantasy cross stitch pattern', keywords: ['fairy', 'dragon', 'unicorn', 'wizard', 'magic', 'fantasy'], hashtags: ['#fantasy', '#fairytales'] },
  { code: 'christmas', humanName: 'Christmas cross stitch pattern', keywords: ['christmas', 'xmas', 'santa', 'snowman', 'reindeer', 'christmas tree'], hashtags: ['#christmas', '#christmasdecor', '#winter'] },
  { code: 'easter', humanName: 'Easter cross stitch pattern', keywords: ['easter', 'egg', 'eggs', 'bunny', 'rabbit'], hashtags: ['#easter', '#spring'] },
];

function detectTheme(pattern: PinPatternInfo): Theme {
  const text = `${pattern.title} ${pattern.description ?? ''} ${pattern.notes ?? ''}`.toLowerCase();

  let bestTheme = DEFAULT_THEME;
  let bestScore = 0;
  for (const theme of THEMES) {
    let score = 0;
    for (const kw of theme.keywords) {
      if (kw && text.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTheme = theme;
    }
  }
  return bestTheme;
}

function toSentenceCase(input: string): string {
  if (!input.trim()) return input;
  let out = '';
  let newSentence = true;
  for (const c of input) {
    if (newSentence && /[a-zA-Z]/.test(c)) {
      out += c.toUpperCase();
      newSentence = false;
    } else {
      out += c.toLowerCase();
    }
    if (c === '.' || c === '!' || c === '?') newSentence = true;
  }
  return out;
}

function buildPinTitle(pattern: PinPatternInfo, theme: Theme): string {
  const titleBase = pattern.title?.trim() || 'Cross stitch pattern';
  let title = `${titleBase} – ${toSentenceCase(theme.humanName)}, printable PDF pattern`;
  const maxLength = 100;
  if (title.length > maxLength) title = title.slice(0, maxLength);
  return title;
}

function buildAltText(pattern: PinPatternInfo, theme: Theme): string {
  const titlePart = pattern.title?.trim() || theme.humanName;
  const sizePart = pattern.width > 0 && pattern.height > 0 ? `${pattern.width} by ${pattern.height} stitches` : '';
  const colorPart = pattern.nColors > 0 ? `${pattern.nColors} colours` : '';

  const parts = ['Counted cross stitch pattern', titlePart];
  const techParts: string[] = [];
  if (sizePart) techParts.push(sizePart);
  if (colorPart) techParts.push(colorPart);
  if (techParts.length > 0) parts.push(techParts.join(', '));

  let alt = parts.join(', ');
  const maxLength = 500;
  if (alt.length > maxLength) alt = alt.slice(0, maxLength);
  return alt;
}

// Phrases pulled at random when the pattern is small (<100x100 stitches).
const BEGINNER_PHRASES = [
  'Perfect for beginners.',
  'Easy-to-stitch design.',
  'Suitable for first-time stitchers.',
  'A simple, quick stitch project.',
  'Small pattern, easy for beginners.',
  'Beginner-friendly and easy to stitch.',
  'A quick stitch — small pattern, simple design.',
  'Simple and beginner-friendly small pattern.',
];

function buildBeginnerHook(pattern: PinPatternInfo): string {
  const isSmall = pattern.width > 0 && pattern.width < 100 && pattern.height > 0 && pattern.height < 100;
  const isLowColor = pattern.nColors > 0 && pattern.nColors < 10;
  if (!isSmall && !isLowColor) return '';

  let hook = '';
  if (isSmall) {
    hook += BEGINNER_PHRASES[Math.floor(Math.random() * BEGINNER_PHRASES.length)] + ' ';
  }
  if (isLowColor) {
    hook += 'Low color count. ';
  }
  return hook;
}

function buildPinDescription(pattern: PinPatternInfo, theme: Theme): string {
  let description = '';

  const title = pattern.title?.trim();
  if (title) description += `${title} – `;

  description += `${theme.humanName}. `;

  if (pattern.width > 0 && pattern.height > 0 && pattern.nColors > 0) {
    description += `${pattern.width} × ${pattern.height} stitches, ${pattern.nColors} colours. `;
  } else {
    description += 'Beautiful counted cross stitch design. ';
  }

  description += buildBeginnerHook(pattern);
  description += 'Printable PDF chart for embroidery & needlework.';

  const hashtags = [
    '#crossstitch', '#crossstitchpattern', '#embroidery', '#needlework', '#crossstitchkit',
    ...theme.hashtags,
  ];
  const uniqueHashtags = [...new Set(hashtags.map(h => h.trim()).filter(Boolean))];
  if (uniqueHashtags.length > 0) {
    description += `\n${uniqueHashtags.join(' ')}`;
  }

  const maxLength = 500;
  if (description.length > maxLength) {
    let cut = description.lastIndexOf(' ', maxLength - 1);
    if (cut < maxLength / 2) cut = maxLength;
    description = description.slice(0, cut).trimEnd();
  }
  return description;
}

export interface PinSeoText {
  title: string;
  description: string;
  altText: string;
  themeCode: string;
}

export function buildPinSeoText(pattern: PinPatternInfo): PinSeoText {
  const theme = detectTheme(pattern);
  return {
    title: buildPinTitle(pattern, theme),
    description: buildPinDescription(pattern, theme),
    altText: buildAltText(pattern, theme),
    themeCode: theme.code,
  };
}
