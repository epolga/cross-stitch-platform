export interface BlogPost {
  slug: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  excerpt: string;
  body: string[]; // paragraphs
  keywords?: string[];
  ctaHref?: string;
  ctaLabel?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'milenas-tin',
    title: 'The tin I inherited from Milena',
    date: '2026-08-05',
    excerpt:
      "Not one thread in this tin has a label. My grandmother never believed in labels — she believed, apparently, that I'd sort it out eventually.",
    keywords: [
      'unlabeled embroidery floss',
      'identify DMC thread color by eye',
      'inherited embroidery floss story',
      'vintage sewing tin',
      'match floss color without a label',
    ],
    imageUrl: '/blog/Milena_round_tin_box_lid_off.png',
    imageAlt: 'An old round tin box full of unlabeled embroidery floss in muted, faded colors, with a pair of vintage sewing scissors resting nearby',
    body: [
      "I keep an old biscuit tin that used to belong to my grandmother, Milena. Inside is embroidery floss with not one label on any of it — she never wrote anything down, just wound up whatever was left over and dropped it in, apparently confident that someday somebody — meaning me — would sort it all out.",
      "She's the one who taught me to stitch, when I was about seven. Patiently, but without a shred of sentimentality: \"hold the needle like this,\" \"don't pull the thread so tight\" — and not one word of praise the entire time, except once, when she nodded at a row of even crosses I'd finally managed. I decided on the spot that was the highest compliment a person could receive.",
      "Every few weeks I open that tin again, hunting for one particular shade of green, and there are perhaps fifteen greens in there, all identical under an ordinary lamp. I hold the skein up to the window, then to the desk lamp, then — for reasons I genuinely cannot defend — I smell it, as though that has ever once helped. Some days I'm half convinced Milena mixed every green in there on purpose, just to watch me struggle over it thirty years later.",
      "And of course, the exact moment I need real concentration — tin open, loose skeins spread across the table, a half-finished piece still on the frame — is precisely when Nitka arrives. Not next to it. On top of it. She seems to have an internal radar tuned to whichever spot I need most right now. Once she managed to knock an entire skein straight into my teacup, and I still haven't decided whether that was an accident.",
      "So Milena's tin stays half mystery, half quiet joke by evening lamplight. I sort colors slower than I probably should — but I think that's rather the point: not to rush it.",
      "Do you have a tin like this of your own — someone else's, handed down, full of things with no labels? I'd love to hear about it. Tap the thread below if this resonates, or just reply if this reached you by email.",
    ],
  },
  {
    slug: 'the-story-behind-black-cat',
    title: 'The story behind Black Cat',
    date: '2026-08-01',
    excerpt:
      "I found her outside, half-frozen, thin enough to count her ribs. She wasn't supposed to make it. This pattern is what I made instead of forgetting that.",
    keywords: [
      'cross stitch cat pattern',
      'black cat cross stitch pattern free',
      'cat rescue story',
      'cross stitch pattern with a story',
      'cottage garden cross stitch pattern',
    ],
    imageUrl: 'https://d2o1uvvg91z7o4.cloudfront.net/photos/15/5460/4.jpg',
    imageAlt: 'Black Cat cross-stitch pattern — a black cat with golden eyes in a cottage garden',
    body: [
      "A few winters ago I found a kitten under the hedge outside my building — soaked through, and thin enough that I could count her ribs through her fur. She didn't run when I reached for her, which is how I knew it was bad. Healthy strays run.",
      "The next few weeks were not a sure thing. A vet, a heating pad, feedings every few hours, and a lot of sitting very still so she'd learn that a hand reaching toward her wasn't something to fear. I won't pretend I knew it would work out. I just kept showing up, the way you do.",
      "She's the reason I named her Nitka — \"little thread\" in Czech — the day she was finally strong enough to climb into my workbasket and calmly unravel half a spool of DMC while I pretended to be annoyed about it.",
      "\"Black Cat\" is my thank-you to her, stitched instead of spoken: a black cat with golden eyes, settled into a cottage garden of poppies, lavender, daisies, and roses, with a blue bird keeping her company. I wanted her to have a garden and someone watching over her, since for a while nobody was watching over her at all.",
      "These days Nitka is unbothered by almost everything, and has an uncanny talent for lying down on exactly the section of fabric I need next. She has no idea any of this is about her, which is probably for the best.",
      "If you've got a rescue of your own — cat, dog, or something stranger — I'd love to hear the story. Tap the thread below if this resonates, or just reply if this reached you by email.",
    ],
    ctaHref: '/Black-Cat-15-210-Free-Design.aspx',
    ctaLabel: 'Download the free Black Cat pattern →',
  },
  {
    slug: 'how-to-turn-a-photo-into-a-cross-stitch-pattern',
    title: 'How to turn a photo into a cross-stitch pattern',
    date: '2026-07-28',
    excerpt:
      "The question I get asked more than any other: \"Can you turn this photo into a pattern like your others?\" Here's exactly how to do it yourself, free, in a few minutes.",
    keywords: [
      'photo to cross stitch pattern',
      'convert photo to cross stitch',
      'turn a picture into a cross stitch pattern',
      'custom cross stitch pattern from photo',
      'free photo to cross stitch converter',
      'cross stitch pattern maker from photo',
      'image to cross stitch pattern generator',
      'make your own cross stitch pattern',
      'pet photo cross stitch pattern',
      'DMC color matching from photo',
      'personalized cross stitch pattern from picture',
      'cross stitch pattern from picture free',
    ],
    body: [
      "The question I get asked more than any other, by a wide margin, is some version of: \"I have this photo — my dog, my granddaughter, our wedding — can you turn it into a pattern like the ones in your catalog?\" For a long time my honest answer was \"not easily.\" Now it is — you can make your own cross-stitch pattern from any picture in a few minutes, free, no software to install.",
      "I built a free photo-to-cross-stitch converter right into the site. You upload a picture, and it reduces it down to a limited palette matched against real DMC thread numbers — the same numbers printed on the floss you'd actually buy — and lays it out as a stitchable grid, symbols and all, ready to export as a printable PDF chart.",
      "The steps are simple. Open the converter, drag in your photo (or click to upload), and it does the color-matching and grid-reduction for you automatically. From there you land in the same online editor that powers every design in the catalog: resize the pattern, change or merge colors, hide colors you're not stitching yet so you can focus on one thread at a time, and undo anything you don't like. Nothing is final until you export.",
      "A few things I've learned from watching which photos turn into patterns people are actually happy with. Simple, high-contrast subjects work best — a pet portrait, a single flower, a clear silhouette against a plain background. A busy photo with a cluttered background will convert, technically, but you'll often get a better result if you crop tightly to the subject first, or accept a larger stitch count so fine detail has somewhere to go. And don't chase perfect photo-realism: cross-stitch has always been a translation, not a copy, and the charm is in that translation.",
      "If you'd rather start from something already made than a blank photo, this works both ways now, too — every design already in the catalog can be opened in the same editor and customized: swap a color, resize it for different fabric, make it yours before you stitch it.",
      "I built this tool for myself first, on the evenings my own hands needed a bigger screen and fewer fiddly paper charts (I've written about why, if you're curious). It genuinely makes me happy every time someone uses it to stitch something of their own — send me a photo of the finished piece if you do. I mean that; I read every one.",
    ],
    ctaHref: '/photo-to-cross-stitch',
    ctaLabel: 'Try the free photo-to-cross-stitch converter →',
  },
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
      "If your hands give you trouble too — I'd love to hear how you've adapted. Tap the thread below if this resonates, or just reply to this email.",
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
