// Maps AlbumID → subject category for faceted filtering.
// Unmapped albums (14 Miscellaneous, 130 Free) are intentionally omitted
// and will not match any subject filter — they appear in "All" results only.

export const albumSubject: Record<number, string> = {
  // Animals
  9: 'animals',   // Birds
  15: 'animals',  // Cats
  16: 'animals',  // Horses
  18: 'animals',  // Dogs
  37: 'animals',  // Animals
  38: 'animals',  // Sea Habitants
  39: 'animals',  // Insects
  48: 'animals',  // Farm Animals
  59: 'animals',  // Butterflies
  61: 'animals',  // Dinosaures

  // Fantasy & Mythology
  19: 'fantasy',  // Zodiac Signs
  20: 'fantasy',  // Fairies
  21: 'fantasy',  // Angels
  22: 'fantasy',  // Dragons
  60: 'fantasy',  // Mermaids
  109: 'fantasy', // Aliens
  114: 'fantasy', // Monsters

  // Nature & Plants
  8: 'nature',    // Nature
  17: 'nature',   // Flowers
  29: 'nature',   // Fruits
  30: 'nature',   // Vegetables
  31: 'nature',   // Leaves
  68: 'nature',   // Mushrooms
  73: 'nature',   // Cosmos
  93: 'nature',   // Cacti

  // People & Characters
  7: 'people',    // Kids
  11: 'people',   // Sages of the World
  27: 'people',   // Ballet
  54: 'people',   // Children
  58: 'people',   // Ladies
  113: 'people',  // Great People of the World

  // Places & Buildings
  4: 'places',    // Buildings
  26: 'places',   // Prague
  62: 'places',   // London

  // Holidays & Occasions
  23: 'holiday',  // MomDay
  34: 'holiday',  // Halloween
  35: 'holiday',  // Christmas
  40: 'holiday',  // Religious
  47: 'holiday',  // Valentine's Day
  51: 'holiday',  // Wedding
  55: 'holiday',  // Easter
  57: 'holiday',  // Forgiveness
  70: 'holiday',  // New Year

  // Countries & Culture
  32: 'culture',  // India
  33: 'culture',  // Philippines
  36: 'culture',  // Islam
  41: 'culture',  // Africa
  42: 'culture',  // Spain
  50: 'culture',  // Thailand
  63: 'culture',  // Sri Lanka
  64: 'culture',  // Buddhism
  65: 'culture',  // Judaica
  72: 'culture',  // New Zealand
  76: 'culture',  // Ukraina
  78: 'culture',  // Hungary
  80: 'culture',  // Japan
  82: 'culture',  // Western Theme
  86: 'culture',  // Vietnam
  88: 'culture',  // Celtic
  89: 'culture',  // France
  90: 'culture',  // Lithuania
  91: 'culture',  // Hawaii
  92: 'culture',  // Greece
  95: 'culture',  // Egypt
  96: 'culture',  // Taiwan
  97: 'culture',  // Australia
  98: 'culture',  // Korea
  99: 'culture',  // China
  100: 'culture', // Morocco
  101: 'culture', // Germany
  102: 'culture', // Israel
  103: 'culture', // Canada
  105: 'culture', // Russia
  107: 'culture', // Indonesia
  108: 'culture', // Socotra Island
  111: 'culture', // Sweden
  112: 'culture', // United States of America
  115: 'culture', // Pakistan
  116: 'culture', // Bulgaria
  117: 'culture', // Paganism
  118: 'culture', // Italy
  119: 'culture', // Military
  120: 'culture', // Ethiopia
  121: 'culture', // Jamaica
  122: 'culture', // Norway
  123: 'culture', // Netherlands
  124: 'culture', // Latvia
  125: 'culture', // United Arab Emirates
  129: 'culture', // Flags

  // Decorative & Patterns
  6: 'decorative',   // Ornaments
  24: 'decorative',  // Simple Motifs
  25: 'decorative',  // Bookmarks
  44: 'decorative',  // Faberge Eggs
  49: 'decorative',  // Alphabets
  81: 'decorative',  // Paintings
  94: 'decorative',  // Silhouettes
  104: 'decorative', // Cushion Covers
  106: 'decorative', // Chevron Style
  110: 'decorative', // Patterns for Bed Sheet
  127: 'decorative', // Emojis

  // Objects & Lifestyle
  28: 'lifestyle',  // Sport
  43: 'lifestyle',  // Vehicles
  52: 'lifestyle',  // Music
  53: 'lifestyle',  // Sayings
  56: 'lifestyle',  // Toys
  66: 'lifestyle',  // Cosmetics
  67: 'lifestyle',  // Meal
  69: 'lifestyle',  // Stationery
  71: 'lifestyle',  // Computers
  74: 'lifestyle',  // Bathroom
  87: 'lifestyle',  // Hats
  128: 'lifestyle', // Tableware
};

export const SUBJECTS = [
  { value: 'animals',    label: 'Animals' },
  { value: 'nature',     label: 'Nature & Plants' },
  { value: 'fantasy',    label: 'Fantasy & Mythology' },
  { value: 'holiday',    label: 'Holidays & Occasions' },
  { value: 'culture',    label: 'Countries & Culture' },
  { value: 'people',     label: 'People & Characters' },
  { value: 'places',     label: 'Places & Buildings' },
  { value: 'decorative', label: 'Decorative' },
  { value: 'lifestyle',  label: 'Objects & Lifestyle' },
] as const;

export type Subject = typeof SUBJECTS[number]['value'];
