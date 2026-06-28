'use client';
import { useState } from 'react';

export type HelpTab = 'about' | 'howto';

interface Props {
  open: boolean;
  initialTab?: HelpTab;
  onClose: () => void;
}

export default function HelpDialog({ open, initialTab = 'howto', onClose }: Props) {
  const [tab, setTab] = useState<HelpTab>(initialTab);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[520px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex gap-1">
            {(['howto', 'about'] as HelpTab[]).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-rose-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t === 'howto' ? 'How to use' : 'About'}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 text-sm text-gray-700 space-y-4">
          {tab === 'about' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">🧵</span>
                <div>
                  <p className="text-base font-semibold text-gray-900">Cross-Stitch Pattern Converter</p>
                  <p className="text-xs text-gray-400">Part of the Cross-Stitch Platform</p>
                </div>
              </div>
              <p>Upload any photo and get a ready-to-stitch cross-stitch pattern with real DMC thread colors. Edit it in your browser, then download a print-ready PDF chart.</p>
            </>
          )}

          {tab === 'howto' && (
            <>
              <div className="bg-rose-50 border border-rose-100 rounded-lg px-4 py-3 text-xs text-rose-700 leading-relaxed">
                <b>Quick start:</b> Click <b>Import → From Photo…</b> in the menu bar, upload a photo, choose a size and number of colors, then click <b>Generate pattern</b>. Edit the result, then click <b>↓ Download PDF</b> to print it.
              </div>

              <Section title="1. Upload a photo">
                <p>Open <b>Import → From Photo…</b> from the menu, then drag and drop your photo or click to browse. Supported formats: JPEG, PNG, WebP — up to 5 MB.</p>
                <p className="text-gray-500">Any photo works — portraits, landscapes, animals, logos. Simple images with clear shapes and fewer colors convert best.</p>
              </Section>

              <Section title="2. Choose size and colors">
                <p>Set the pattern <b>width and height in stitches</b> (default 80 × 80). A good beginner size is 50–80 stitches wide. The photo fits inside those dimensions while keeping its proportions — empty cells are added as padding.</p>
                <p>Use the <b>🔗</b> button to lock width and height together so the photo isn&apos;t stretched.</p>
                <p>Choose how many <b>DMC thread colors</b> to use: 10, 15, 20, or 25. Fewer colors = simpler to stitch. Start with 10 or 15 if you&apos;re new to cross-stitch.</p>
                <p>Click <b>Generate pattern</b> to convert. You can re-import at any time to try different settings.</p>
              </Section>

              <Section title="3. Drawing tools (left toolbar)">
                <ul className="space-y-1.5 list-none">
                  <Li icon="✏️"><b>Pen</b> — click cells to paint them with the active color. Click the <b>▾</b> arrow to switch between Point, Line, Rectangle, and Ellipse shapes. Drag the <b>Pen size</b> slider to paint multiple stitches at once.</Li>
                  <Li icon="◻"><b>Pen Eraser</b> (inside the Pen ▾ menu) — erases individual stitches. Same shapes available.</Li>
                  <Li icon="🪣"><b>Fill</b> — click any cell to fill its whole connected area with the active color. Great for recoloring large regions. Use <b>Erase Fill</b> (Pen ▾ menu) to clear a region instead.</Li>
                  <Li icon="↩"><b>Undo / Redo</b> — undo up to 50 steps with Ctrl+Z, redo with Ctrl+Y.</Li>
                </ul>
              </Section>

              <Section title="4. Selecting and transforming">
                <ul className="space-y-1.5 list-none">
                  <Li icon="▦"><b>Select</b> — drag on the canvas to select a rectangular area. Then use <b>Cut</b>, <b>Copy</b> (Ctrl+C), <b>Paste</b> (Ctrl+V), or <b>Crop</b>.</Li>
                  <Li icon="↔↕"><b>Flip H / Flip V</b> — mirror the design horizontally or vertically. Applies to the selection only if one exists, otherwise the whole design.</Li>
                  <Li icon="↻↺"><b>Rot R / Rot L / 180°</b> — rotate the design 90° clockwise, counter-clockwise, or 180°. Applies to selection or whole design.</Li>
                </ul>
              </Section>

              <Section title="5. The color palette (right panel)">
                <p>The panel on the right lists all thread colors in your pattern. Each row shows:</p>
                <ul className="space-y-1.5 list-none mt-1">
                  <Li icon="🎨">A <b>color swatch</b> — click it to set that color as your active drawing color.</Li>
                  <Li icon="◆">A <b>symbol</b> — the symbol used for that color in the printed PDF. Click to change it.</Li>
                  <Li icon="✏️">A <b>pencil icon</b> — opens options to change the color, change the symbol, move its position, or merge it into another color.</Li>
                  <Li icon="👁">An <b>eye checkbox</b> — hide or show that color on the canvas (useful when editing a specific area).</Li>
                </ul>
                <p className="mt-1">Use <b>Palette → Add Color…</b> to add extra DMC colors manually. Use <b>Palette → Remove Unused</b> to clean up colors with zero stitches.</p>
              </Section>

              <Section title="Color picking tips">
                <ul className="space-y-1 list-none">
                  <Li icon="🖱">Click a <b>color swatch</b> in the palette to make it the active drawing color.</Li>
                  <Li icon="🖱"><b>Right-click a cell</b> on the canvas to instantly pick that cell&apos;s color and highlight its swatch.</Li>
                  <Li icon="🖱"><b>Right-click a swatch</b> in the palette to blink all cells of that color on the canvas — useful for checking where a color is used.</Li>
                </ul>
              </Section>

              <Section title="Keyboard shortcuts">
                <table className="w-full text-xs border-separate border-spacing-y-0.5">
                  <tbody>
                    {[
                      ['Ctrl+Z', 'Undo'],
                      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
                      ['Ctrl+C', 'Copy selection'],
                      ['Ctrl+X', 'Cut selection'],
                      ['Ctrl+V', 'Paste'],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-4 font-mono text-gray-500 whitespace-nowrap">{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="View modes">
                <ul className="space-y-1 list-none">
                  <Li icon="🎨"><b>Color</b> — shows stitches as colored squares (default).</Li>
                  <Li icon="◆"><b>Symbol</b> — shows stitches as chart symbols, exactly as they appear in the printed PDF.</Li>
                  <Li icon="⊞"><b>Both</b> — shows color and symbol together. Useful when editing the pattern.</Li>
                  <Li icon="🧵"><b>Preview</b> — approximates how the finished embroidery will look when stitched.</Li>
                </ul>
              </Section>

              <Section title="Resize & Crop">
                <p><b>Chart → Resize…</b> — change the canvas dimensions. Choose <em>Resize canvas</em> to pad or trim the edges (anchored top-left or center), or <em>Scale content</em> to stretch the whole pattern to the new size.</p>
                <p><b>Chart → Size to Design</b> — automatically trims empty border rows and columns to fit tightly around your stitches.</p>
                <p><b>Edit → Crop to Selection</b> (or the Crop button) — trim the canvas to the selected area.</p>
              </Section>

              <Section title="Download">
                <p>Click <b>↓ Download PDF</b> (top right) to export the current pattern as a print-ready PDF with a color key showing each DMC thread number and stitch count.</p>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-900 mb-1">{title}</p>
      <div className="space-y-1 text-gray-700">{children}</div>
    </div>
  );
}

function Li({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="w-5 text-center text-gray-400 flex-none font-mono text-xs pt-0.5">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
