export interface BlogPost {
  slug: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  excerpt: string;
  body: string[]; // paragraphs
  keywords?: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'editor-updates-july-2026',
    title: "Everything that changed, in detail",
    date: '2026-07-08',
    excerpt:
      "You asked me to try the editor and tell you the truth. You did — and here, in full, is everything that changed because of it.",
    keywords: [
      'cross stitch editor updates',
      'cross stitch pattern editor changelog',
      'photo to cross stitch converter updates',
    ],
    body: [
      "A little while back I asked some of you to try the pattern editor and tell me, honestly, what felt off. You did — in real detail, with real patience. Here is everything that changed because of it.",
      "Diagonal lines actually look diagonal. Drawing a line at an angle used to force it into a \"staircase\" of horizontal and vertical steps, because the tool only ever showed you grid-snapped squares while you dragged. Now the Line, Rectangle, and Ellipse tools show a smooth outline that follows your actual mouse movement — the shape only snaps to stitches once you let go. It sounds small, but it makes drawing anything at an angle feel like drawing, instead of fighting the grid.",
      "Dragging a photo out of Google now works. If you tried dragging an image straight from a Google Photos tab (or almost any other website) into the editor and nothing happened — that wasn't you doing something wrong. Browsers only hand over a link when you drag an image out of another site, not the actual picture, so the editor had nothing to import. It now fetches the image itself when that happens, so the drag-and-drop you'd expect just works. (If the link turns out not to be an image, or the site blocks it, you'll get a clear message instead of nothing at all.)",
      "The Save and Download buttons no longer overlap on a phone. On narrow screens, the pattern name, Save button, and Download button used to crowd into each other and become genuinely hard to tap. The header now wraps sensibly on small screens instead of squeezing everything into one row.",
      "Saved patterns remember which colors you'd hidden. If you hide some colors while stitching — to focus on one thread at a time — that now travels with the pattern when you save it. Reopen it later, on your phone or your computer, and it comes back exactly as you left it.",
      "Downloading a PDF now tells you it's working. The Download PDF button now shows \"Downloading…\" and disables itself for a moment after you click it, so a slow connection doesn't leave you wondering whether your click registered at all.",
      "None of this happened because I guessed what to fix — it happened because you told me. If something here still isn't quite right, or you've thought of something you wish the editor could do, I'd genuinely love to hear it. Reply to any of my emails, or use the feedback button inside the editor itself.",
    ],
  },
  {
    slug: 'why-i-built-this',
    title: 'The real reason I built this site',
    date: '2026-07-08',
    excerpt:
      "For years my evenings looked the same: a lamp pulled close, a paper chart flattened under a book so it wouldn't curl, my glasses pushed up my nose. Then my hands started telling me a different story.",
    keywords: [
      'cross stitch and arthritis',
      'stitching with hand pain',
      'why I built cross-stitch.com',
      'cross stitch for beginners with hand pain',
    ],
    body: [
      "For years, my evenings looked the same: a lamp pulled close, a paper chart flattened under a book to keep it from curling, and my glasses pushed up my nose so I could see which square was which.",
      "About six years ago, my hands started telling me a different story. Nothing dramatic — just a stiffness in my fingers by evening, worse in winter, worse if I'd been stitching for more than twenty minutes at a stretch. My doctor called it, gently, \"the ordinary kind\" of arthritis. I called it inconvenient.",
      "I didn't want to give up stitching. I really didn't want to give up stitching. So I started experimenting: a bigger screen instead of a small paper grid, being able to zoom in without holding anything steady, being able to walk away mid-row and find my place again without hunting for it.",
      "That tinkering is, quite literally, where this site came from. Every feature that lets you hide colors while you stitch, save your place, or read a chart on a tablet propped against your kettle — I built those for myself first, on the evenings my hands needed the help.",
      "I still keep threads from my grandmother Milena's old sewing box, most of them long unlabeled, and I still lose an embarrassing amount of time each week trying to match a scrap of pale green floss to a DMC number. Some things paper and screens both can't fix.",
      "If your hands give you trouble too — I'd love to hear how you've adapted. Just reply to this email, or leave a thread below.",
    ],
  },
  {
    slug: 'let-cross-stitch-remain-for-generations',
    title: 'Let cross stitch remain for generations',
    date: '2026-05-01',
    excerpt:
      'A short story about Eleanor and Lydia in the tiny town of Eldridge, and a quiet hope that hand embroidery keeps its place next to everything digital.',
    keywords: [
      'cross-stitch short story',
      'cross-stitch reflections',
      'hand embroidery stories',
      'keep cross stitch alive',
      'Eldridge story',
      'grandmother granddaughter cross stitch',
    ],
    body: [
      "This is the story of librarian Eleanor Thompson, who spent her entire life working as a librarian in the tiny town of Eldridge, far from the bustle of civilization. After sixty-five years of work, she finally retired and was able to pursue her passion: cross-stitching.",
      "Now, every evening at sunset, Eleanor would settle into a velvet chair by the window, carefully placing the wooden frame on her lap, as if it were a precious manuscript. She quietly embroidered to the sound of soft music, and time passed unnoticed...",
      "The pattern she chose that fall was simply delightful: a blooming rose garden, embroidered with crimson, emerald, and gold threads. She loved it! With precise movements, Eleanor moved the needle across the fabric, creating tiny crosses that gradually formed a pattern. This work became a kind of meditation for her, aided by her patience and perseverance, honed over a lifetime of cataloging thick volumes.",
      "One evening, when the work was almost complete, a light knock on the door interrupted her solitude. It was her granddaughter, Lydia, visiting from the big city. Young Lydia, a researcher in digital archives, looked at the embroidery with interest.",
      "“Listen, Grandma, it’s just like your library—every cross stitch in its place, creating a whole!”",
      "Come to think of it, Lydia was right, don’t you think?",
      "I just hope that cross stitch doesn’t disappear like the paper books Eleanor worked with, giving way to the digital ones Lydia works with.",
      "That’s my greatest hope.",
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getSortedBlogPosts(): BlogPost[] {
  return [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
}
