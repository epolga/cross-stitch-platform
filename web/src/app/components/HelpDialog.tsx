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
              <p>Converts any photo into a counted cross-stitch pattern using real DMC thread colors. The result can be edited directly in the browser and downloaded as a print-ready PDF.</p>
              <p className="text-xs text-gray-400">Built with Next.js · Canvas API · Sharp · k-means color quantization</p>
            </>
          )}

          {tab === 'howto' && (
            <>
              <Section title="1. Upload a photo">
                <p>Drag and drop a photo onto the upload area, or click it to browse. Supported formats: JPEG, PNG, WebP — up to 5 MB.</p>
              </Section>

              <Section title="2. Choose size and colors">
                <p>Set the pattern width and height in stitches (default 80 × 80). The photo is fitted inside those dimensions preserving its aspect ratio — empty cells are added as padding.</p>
                <p>Use the <b>🔗</b> button to lock width and height together while typing.</p>
                <p>Choose how many DMC colors to use: 10, 15, 20, or 25. More colors = more detail, but harder to stitch.</p>
                <p>Click <b>Generate pattern</b> to convert.</p>
              </Section>

              <Section title="3. Edit the pattern">
                <ul className="space-y-1.5 list-none">
                  <Li icon="·/╱/▭/◯"><b>Pencil</b> — draw cells. Click the button to cycle between Point, Line, Rectangle, and Ellipse modes.</Li>
                  <Li icon="🪣"><b>Fill</b> — flood-fill a region with the active color. Switch to <b>Erase Fill</b> to clear a region instead.</Li>
                  <Li icon="▦"><b>Select</b> — drag to select a rectangular region. Then use Cut / Copy / Paste / Crop.</Li>
                  <Li icon="↔↕"><b>Flip H / V</b> — flip the selection (or the whole design if nothing is selected).</Li>
                  <Li icon="↻↺"><b>Rotate</b> — rotate 90° right, 90° left, or 180° (selection or whole design).</Li>
                </ul>
              </Section>

              <Section title="Color picking">
                <ul className="space-y-1 list-none">
                  <Li icon="🖱">Click a <b>swatch</b> in the palette column to set the active color.</Li>
                  <Li icon="🖱"><b>Right-click a cell</b> to pick its color as active and blink its swatch.</Li>
                  <Li icon="🖱"><b>Right-click a swatch</b> to blink all cells of that color on the canvas.</Li>
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

              <Section title="Resize & Crop">
                <p><b>Chart → Resize…</b> — change the canvas dimensions. Choose <em>Resize canvas</em> to pad or crop edges (anchor top-left or center), or <em>Scale content</em> to stretch the whole pattern to the new size.</p>
                <p><b>Edit → Crop to Selection</b> (or the Crop button) — trim the canvas to the selected region.</p>
              </Section>

              <Section title="Download">
                <p>Click <b>↓ Download PDF</b> to export the current (edited) pattern as a print-ready PDF with a color key.</p>
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
