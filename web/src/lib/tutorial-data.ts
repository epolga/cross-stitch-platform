export interface TutorialSection {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

export interface TutorialFaq {
  q: string;
  a: string;
}

export interface TutorialImage {
  src: string;
  alt: string;
}

export interface TutorialGuide {
  slug: string;
  category: string;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  image?: TutorialImage;
  sections: TutorialSection[];
  faq: TutorialFaq[];
  updatedDate: string; // ISO yyyy-mm-dd
}

export const CATEGORY_ORDER = [
  'Getting Started',
  'Creating & Editing',
  'Stitching',
  'Finishing & Sharing',
];

export const tutorials: TutorialGuide[] = [
  {
    slug: 'your-first-pattern',
    category: 'Getting Started',
    title: 'Your First Pattern',
    h1: 'Your First Pattern: Three Ways to Start',
    metaDescription:
      'How to start your first cross-stitch pattern on Cross-Stitch.com — from a photo, from a blank canvas, or from an existing catalog design.',
    intro:
      "There's no single right way to begin a pattern here — pick whichever of these three starting points matches what you already have.",
    image: {
      src: '/tutorial/editor-overview.png',
      alt: 'The Cross-Stitch.com editor showing a converted photo pattern, the menu bar, drawing toolbar, and color palette',
    },
    sections: [
      {
        heading: '1. From a photo',
        paragraphs: [
          'The fastest way to a finished pattern: open the editor, click Upload Your Photo (or Try a Sample Image if you just want to see how it works), and drag in a picture. Choose a width and height in stitches and how many DMC thread colors to use, then click Generate pattern.',
          "You land straight in the full editor with the converted result — nothing is final at this point. Repaint cells, merge colors, resize, or mirror the design before you download anything.",
        ],
        list: [
          'Simple, high-contrast subjects convert best — a pet portrait, a single flower, a clear silhouette against a plain background.',
          'A good beginner size is 50–80 stitches wide. Larger sizes preserve more detail but take longer to stitch.',
          '10–15 colors is a manageable start; add more later if you want finer detail.',
        ],
      },
      {
        heading: '2. From a blank canvas',
        paragraphs: [
          "Prefer to design by hand? Choose New Pattern in the editor to start from an empty 80×80 grid with a starter palette of 16 common DMC colors. Every tool — pencil, fill, shapes, mirror, resize — works exactly the same whether your pattern started from a photo or from nothing at all.",
        ],
      },
      {
        heading: '3. From an existing catalog design',
        paragraphs: [
          "Browsing the catalog and want to tweak a design instead of starting over? Any pattern in the catalog has an Open in editor option on its page — it loads straight into the same editor, fully editable, without touching the original catalog copy. Saving creates your own separate copy.",
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need an account to start a pattern?',
        a: 'No — converting a photo, starting from a blank canvas, and editing the result are all free with no account. An account is only needed once you want to save a pattern or download the PDF.',
      },
      {
        q: 'Can I change my mind about the size or colors after generating?',
        a: "Yes — re-open Import → From Photo… at any time to convert the same photo again with different settings, or use Chart → Resize… to change dimensions on the pattern you already have.",
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'converting-a-photo',
    category: 'Creating & Editing',
    title: 'Converting a Photo to a Pattern',
    h1: 'Converting a Photo to a Cross-Stitch Pattern',
    metaDescription:
      'How photo-to-pattern conversion works on Cross-Stitch.com: choosing size and color count, supported formats, and tips for a cleaner result.',
    intro:
      'Photo conversion turns any picture into a stitchable grid matched against real DMC thread numbers. Here is exactly what each setting does.',
    image: {
      src: '/tutorial/import-from-photo.png',
      alt: 'The Import from Photo dialog showing width and height fields, thread color count buttons, and processing mode options',
    },
    sections: [
      {
        heading: 'Uploading a photo',
        paragraphs: [
          'Open Import → From Photo… from the menu bar, then drag and drop your photo or click to browse. Supported formats are JPEG, PNG, and WebP, up to 5 MB.',
        ],
      },
      {
        heading: 'Width and height',
        paragraphs: [
          'Set the pattern width and height in stitches independently — the default is 80×80. The photo is fit inside those dimensions while keeping its proportions; empty cells are added as padding where needed. Use the 🔗 lock button to keep width and height locked to the photo\'s aspect ratio so it isn\'t stretched.',
        ],
      },
      {
        heading: 'Color count',
        paragraphs: [
          'Choose how many DMC thread colors to reduce the photo to: 5, 10, 20, 30, 40, 50, or 100. Fewer colors means a simpler, faster stitch; more colors preserves finer detail and gradients. There\'s no wrong answer — you can re-generate with a different count at any time.',
        ],
      },
      {
        heading: 'Getting a cleaner result',
        paragraphs: ['A few things that consistently make the automatic conversion look better:'],
        list: [
          'Crop tightly to your subject before uploading if the background is busy.',
          'Good contrast between the subject and background converts more cleanly than a low-contrast photo.',
          "Don't chase photo-realism — cross-stitch has always been a translation, not a copy. A slightly stylized result usually stitches up better than a maximally detailed one.",
          "If the automatic result has scattered single stray stitches, the editor's pencil and fill tools clean those up in seconds — see Drawing Tools.",
        ],
      },
    ],
    faq: [
      {
        q: 'What image formats are supported?',
        a: 'JPEG, PNG, and WebP, up to 5 MB per file.',
      },
      {
        q: 'Can I convert the same photo more than once with different settings?',
        a: 'Yes — open Import → From Photo… again at any time and generate a fresh result without leaving the editor.',
      },
      {
        q: 'Is converting a photo free?',
        a: 'Yes, with no account required. An account is only needed to save the pattern or download the PDF.',
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'drawing-tools',
    category: 'Creating & Editing',
    title: 'Drawing Tools',
    h1: 'Drawing Tools: Pen, Eraser, and Fill',
    metaDescription:
      'A guide to the Cross-Stitch.com editor\'s drawing tools — pen shapes, pen width, eraser, and fill — for repainting or hand-designing a pattern.',
    intro: 'The Draw toolbar covers everything needed to hand-edit a pattern, whether it started from a photo or from scratch.',
    image: {
      src: '/tutorial/drawing-toolbar.png',
      alt: 'The editor\'s drawing toolbar showing Undo, Redo, Pen, Eraser, Fill, Fill Erase, Select, view mode buttons, and the Stitch Mode button',
    },
    sections: [
      {
        heading: 'Pen',
        paragraphs: [
          'Click cells to paint them with the active color. Click the ▾ arrow next to Pen to switch between Point (single stitches), Line, Rectangle, and Ellipse — Shift while dragging constrains a rectangle or ellipse to a perfect square/circle. Drag the Size slider to paint a wider block of stitches at once, useful for filling large areas quickly.',
        ],
      },
      {
        heading: 'Eraser',
        paragraphs: [
          'Clears individual stitches back to empty. It shares the same shape and size options as Pen — an eraser set to Line, for example, clears a straight line of stitches in one drag.',
        ],
      },
      {
        heading: 'Fill',
        paragraphs: [
          'Click any cell to fill its whole connected area with the active color — the same idea as a paint-bucket tool in any image editor, scoped to the pattern grid. Fill Erase (in the toolbar next to Fill) does the opposite: clears a whole connected area back to empty in one click.',
        ],
      },
      {
        heading: 'Undo and redo',
        paragraphs: ['Ctrl+Z undoes up to 50 steps; Ctrl+Y (or Ctrl+Shift+Z) redoes. Each pencil stroke, fill, or shape counts as a single undo step, not each individual cell.'],
      },
    ],
    faq: [
      {
        q: 'How do I paint more than one stitch at a time?',
        a: 'Drag the pen Size slider up — a size of 3, for example, paints a 3×3 block of stitches with every click or drag stroke.',
      },
      {
        q: 'Can I draw a perfect circle or square?',
        a: 'Yes — select the Ellipse or Rectangle shape from the Pen ▾ menu and hold Shift while dragging.',
      },
      {
        q: 'How many undo steps are available?',
        a: 'Up to 50 steps back, via Ctrl+Z.',
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'selecting-copying-resizing',
    category: 'Creating & Editing',
    title: 'Selecting, Copying & Resizing',
    h1: 'Selecting, Copying, and Resizing a Pattern',
    metaDescription:
      'How to select, copy, crop, flip, rotate, and resize a cross-stitch pattern in the Cross-Stitch.com editor.',
    intro: 'These tools work on a rectangular selection when you have one active, or the whole design when you don\'t.',
    image: {
      src: '/tutorial/select-tool.png',
      alt: 'A rectangular selection active on the canvas, with Copy, Cut, and Crop buttons showing in the toolbar',
    },
    sections: [
      {
        heading: 'Selecting',
        paragraphs: [
          'Choose the Select tool, then drag on the canvas to mark a rectangular area. With a selection active, Copy (Ctrl+C), Cut (Ctrl+X), Paste (Ctrl+V), and Crop all apply to just that area. Clicking outside the canvas, or switching to another tool, clears the selection.',
        ],
      },
      {
        heading: 'Flip and rotate',
        paragraphs: [
          'Edit → Flip → Horizontal / Vertical mirrors the design left-right or top-bottom. Edit → Rotate → 90° Right / 90° Left / 180° turns it in 90° steps. Both apply to the current selection if one exists, otherwise to the whole pattern.',
        ],
      },
      {
        heading: 'Resize',
        paragraphs: [
          'Chart → Resize… changes the canvas dimensions two different ways: Resize canvas pads or trims the edges (anchored to the top-left corner or centered), keeping existing stitches at their original size; Scale content stretches the whole pattern to fit the new dimensions instead.',
          "Chart → Size to Design automatically trims empty border rows and columns so the canvas fits tightly around your stitches — handy after cropping or heavy editing leaves a lot of empty margin.",
        ],
      },
      {
        heading: 'Crop to selection',
        paragraphs: ['With a selection active, Edit → Crop to Selection (or the Crop button that appears) trims the whole canvas down to just that rectangle, discarding everything outside it.'],
      },
    ],
    faq: [
      {
        q: 'What\'s the difference between "Resize canvas" and "Scale content"?',
        a: 'Resize canvas keeps every existing stitch at its original size and adds or trims empty space at the edges. Scale content stretches or shrinks the entire pattern to fit the new dimensions, changing the size of every stitch relative to the whole design.',
      },
      {
        q: 'Does flipping or rotating affect the whole pattern or just part of it?',
        a: 'It applies to your current selection if you have one active; otherwise it applies to the entire pattern.',
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'colors-and-the-palette',
    category: 'Creating & Editing',
    title: 'Colors & the Palette',
    h1: 'Working with Colors and the Palette Panel',
    metaDescription:
      'How the color palette works in the Cross-Stitch.com editor — picking, hiding, merging, and adding DMC thread colors.',
    intro: 'The palette panel on the right of the editor lists every thread color currently in your pattern.',
    image: {
      src: '/tutorial/palette-panel.png',
      alt: 'The color palette panel listing DMC thread colors, each with a swatch, symbol, edit icon, and eye icon',
    },
    sections: [
      {
        heading: 'The palette panel',
        paragraphs: [
          'Each row shows a color swatch (click to set it as your active drawing color), the symbol used for that color in the printed PDF (click to change it), an edit icon (change the color itself, change the symbol, move the color\'s position in the list, or merge it into another color), and an eye icon to hide or show that color on the canvas — useful for stitching one thread at a time without the rest of the design distracting you.',
        ],
      },
      {
        heading: 'Picking colors on the canvas',
        paragraphs: ['Three ways to work with color while editing:'],
        list: [
          'Click a swatch in the palette to make it the active drawing color.',
          "Right-click a cell on the canvas to instantly pick that cell's color and highlight its swatch in the palette — no need to hunt for it in the list.",
          "Click a swatch to flash all cells of that color on the canvas at once, handy for seeing at a glance where a color is used before you decide to merge or remove it.",
        ],
      },
      {
        heading: 'Adding, merging, and removing colors',
        paragraphs: [
          'Palette → Add Color… adds any DMC color to your palette manually, even if it isn\'t used yet. To reduce a palette that came out with too many similar shades, open a color\'s edit menu and choose Merge into…, then pick the target color — every stitch of the merged color repaints to match. Palette → Remove Unused clears out any color with zero stitches left in the design.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I stitch one color at a time without the rest of the design in the way?',
        a: "Click the eye icon next to every color except the one you're working on to hide them, leaving only your active thread's stitches visible.",
      },
      {
        q: 'Can I combine two similar colors into one?',
        a: 'Yes — open the color\'s edit menu (the pencil icon) and choose Merge into…, then pick the color to combine it with.',
      },
      {
        q: "What if I want to find where a color is used before I decide what to do with it?",
        a: 'Click its swatch in the palette — every cell of that color flashes on the canvas.',
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'stitch-mode',
    category: 'Stitching',
    title: 'Stitch Mode — Tracking Your Progress',
    h1: 'Stitch Mode: Never Lose Your Place While Stitching',
    metaDescription:
      'How to use Stitch Mode on Cross-Stitch.com to mark completed stitches, spotlight a color, and pick up exactly where you left off — on any device.',
    intro:
      'Stitch Mode is a separate mode from editing — once your pattern is finished and saved, it lets you mark cells as you physically stitch them, so you always know where you left off.',
    image: {
      src: '/tutorial/stitch-mode.png',
      alt: 'Stitch Mode active on a pattern with a band of marked cells dimmed, a progress bar reading stitches completed, and remaining-stitch counts next to each palette color',
    },
    sections: [
      {
        heading: 'Turning it on',
        paragraphs: [
          "The 🧵 Stitch Mode button sits next to the view-mode buttons (Preview / Color / Symbol / Both) above the canvas. It's disabled with a tooltip until your pattern is saved — progress needs something stable to attach to, and saving already requires a free account. Once saved, click it to switch in.",
          "While Stitch Mode is on, the drawing toolbar hides and a progress bar appears showing how many stitches are marked done, as a count and a percentage.",
        ],
      },
      {
        heading: 'Marking stitches',
        paragraphs: [
          "Tap or click a cell to mark it done — it dims so your eye reads remaining work at a glance. Drag across several cells to mark a whole area at once; a single drag either marks or un-marks consistently, based on the state of the cell you started on, so you never get a flickering mix of on/off within one stroke.",
        ],
      },
      {
        heading: 'Spotlighting a color',
        paragraphs: [
          "Click any color in the palette while in Stitch Mode to spotlight it — every other color dims so the thread you're currently working with stands out clearly. Click the same color again to turn the spotlight off.",
        ],
      },
      {
        heading: 'Syncing across devices',
        paragraphs: [
          "Progress saves automatically a couple of seconds after you stop marking, and is tied to your saved pattern — reopen it later on a phone, tablet, or a different computer while logged in, and your marks are exactly where you left them.",
        ],
      },
      {
        heading: 'Starting over',
        paragraphs: [
          'Clear progress, next to the progress bar, resets every mark back to unstitched after a confirmation prompt — useful if you\'re restarting the same pattern as a fresh project. Resizing, mirroring, or using Size to Design also clears progress automatically, since a changed layout would make the old marks point at the wrong cells.',
        ],
      },
    ],
    faq: [
      {
        q: 'Why is the Stitch Mode button disabled?',
        a: "It needs a saved pattern to attach progress to. Save your pattern first (which requires a free account) and the button becomes active.",
      },
      {
        q: 'Will my progress still be there if I close the tab and come back tomorrow?',
        a: "Yes — progress is saved to your account, not just your browser, so it's there whenever you reopen the pattern, on any device.",
      },
      {
        q: 'Does marking stitches cost anything?',
        a: 'No — Stitch Mode is free, like the rest of the editor right now.',
      },
      {
        q: 'What happens to my progress if I resize the pattern afterward?',
        a: "It clears automatically. A resize shifts every coordinate, so old marks would no longer line up with the right cells — better to start progress tracking fresh than have it silently wrong.",
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'exporting-your-pdf',
    category: 'Finishing & Sharing',
    title: 'Exporting Your PDF',
    h1: 'Exporting a Print-Ready PDF Chart',
    metaDescription:
      'What\'s included in a Cross-Stitch.com PDF export, and how to download a print-ready chart for your pattern.',
    intro: 'The PDF is the finished, stitchable output of everything you\'ve built in the editor.',
    image: {
      src: '/tutorial/editor-overview.png',
      alt: 'The editor toolbar with the Download PDF button in the top-right corner',
    },
    sections: [
      {
        heading: 'How to export',
        paragraphs: [
          'Click ↓ Download PDF in the top-right of the editor. You\'ll be asked to name the pattern if you haven\'t already; the button shows Downloading… while it generates, so a slow connection doesn\'t leave you wondering whether your click registered.',
        ],
      },
      {
        heading: 'What\'s in the PDF',
        paragraphs: ['Every export includes three parts:'],
        list: [
          'A color chart — the full pattern in DMC thread colors, best for stitching in good light.',
          'A symbol chart — the same pattern in black and white, each color shown as a unique symbol. Cheaper to print and easier to read under a lamp.',
          'A color key table listing the symbol, DMC number, color name, and stitch count for every thread used, so you know exactly what to buy.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need an account to download the PDF?',
        a: 'Yes — an account is required to download, and it\'s free right now with no paid tier live yet.',
      },
      {
        q: 'Does the PDF include a symbol version for black-and-white printing?',
        a: 'Yes, every export includes both a full-color chart and a symbol chart.',
      },
      {
        q: 'Will the PDF tell me how much of each thread color to buy?',
        a: 'Yes — the color key page lists the stitch count for every DMC color used.',
      },
    ],
    updatedDate: '2026-07-30',
  },
  {
    slug: 'saving-and-sharing',
    category: 'Finishing & Sharing',
    title: 'Saving & Sharing Patterns',
    h1: 'Saving and Sharing Your Pattern',
    metaDescription:
      'How to save a pattern to your Cross-Stitch.com account, reopen it later, and share a link with someone else.',
    intro: 'Saving is what turns a browser session into something you can come back to — on any device, whenever you\'re ready.',
    image: {
      src: '/tutorial/save-dialog.png',
      alt: 'The Save pattern dialog with a pattern name field and Save button',
    },
    sections: [
      {
        heading: 'Saving',
        paragraphs: [
          "Click 💾 Save pattern and give it a name. This requires a free account — if you're not logged in yet, you'll be prompted to register first. Once saved, the button changes to a plain Save that silently updates the same pattern each time, and the page URL updates to include the pattern's link.",
        ],
      },
      {
        heading: 'Reopening a saved pattern',
        paragraphs: [
          "File → Open… lists every pattern saved to your account, with a thumbnail and last-modified date, so you can pick up any of them again later — including Stitch Mode progress, hidden colors, and everything else exactly as you left it.",
        ],
      },
      {
        heading: 'Sharing a link',
        paragraphs: [
          "Once a pattern is saved, Copy Link copies a shareable URL to your clipboard. Anyone with the link can view and open the pattern in the editor — no account needed on their end — which is handy for showing a gift design before you stitch it, or asking someone for a second opinion on a color choice.",
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need an account to save a pattern?',
        a: 'Yes — saving (and downloading the PDF) requires a free account. Converting a photo and editing are free with no account.',
      },
      {
        q: 'Can someone else open my pattern without signing up?',
        a: "Yes — a copied share link opens the pattern for anyone, no account required on their end.",
      },
      {
        q: 'If I share a link, can the other person edit my original?',
        a: "They can open and edit it in their own session, but saving their changes creates a separate copy under their own account — your original isn't affected.",
      },
    ],
    updatedDate: '2026-07-30',
  },
];

export function getTutorial(slug: string): TutorialGuide | undefined {
  return tutorials.find(t => t.slug === slug);
}
