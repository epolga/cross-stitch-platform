'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type MenuSeparator = { type: 'separator' };
export type MenuAction = {
  type: 'item';
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
};
export type MenuSubmenu = {
  type: 'submenu';
  label: string;
  items: (MenuAction | MenuSeparator)[];
};
export type MenuItem = MenuAction | MenuSeparator | MenuSubmenu;
export type MenuDef = { label: string; items: MenuItem[] };

interface Props {
  menus: MenuDef[];
}

function renderAction(item: MenuAction, close: () => void) {
  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => { close(); item.onClick(); }}
      className="flex items-center justify-between w-full px-4 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default gap-6"
    >
      <span className="flex items-center gap-2">
        {item.checked != null && <span className="w-3 text-xs">{item.checked ? '✓' : ''}</span>}
        {item.label}
      </span>
      {item.shortcut && <span className="text-xs text-gray-400 flex-none">{item.shortcut}</span>}
    </button>
  );
}

function SubMenu({ item, close }: { item: MenuSubmenu; close: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="flex items-center justify-between w-full px-4 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 gap-6"
      >
        <span>{item.label}</span>
        <span className="text-xs text-gray-400 flex-none">▶</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 min-w-[160px] bg-white border border-gray-200 rounded shadow-lg py-1 z-50">
          {item.items.map((sub, si) => {
            if (sub.type === 'separator') return <div key={si} className="my-1 border-t border-gray-100" />;
            return <div key={si}>{renderAction(sub, close)}</div>;
          })}
        </div>
      )}
    </div>
  );
}

export default function MenuBar({ menus }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open == null) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (barRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => setOpen(null);

  // The menu bar itself scrolls horizontally on narrow screens (overflow-x-auto),
  // which — per the CSS overflow spec — forces overflow-y to an effective "auto"
  // too, clipping any dropdown positioned inside it. Rendering the open dropdown
  // through a portal, positioned via the trigger button's own screen coordinates,
  // sidesteps that clipping entirely instead of fighting the parent's overflow.
  function openMenu(mi: number) {
    const btn = buttonRefs.current[mi];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen(mi);
  }

  function toggleMenu(mi: number) {
    if (open === mi) { setOpen(null); return; }
    openMenu(mi);
  }

  return (
    <div ref={barRef} className="relative flex items-center flex-nowrap gap-0.5 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-sm select-none overflow-x-auto">
      {menus.map((menu, mi) => (
        <div key={menu.label} className="relative">
          <button
            ref={el => { buttonRefs.current[mi] = el; }}
            type="button"
            onClick={() => toggleMenu(mi)}
            onMouseEnter={() => { if (open != null && open !== mi) openMenu(mi); }}
            className={`px-2.5 py-0.5 rounded text-gray-700 hover:bg-gray-200 transition-colors ${open === mi ? 'bg-gray-200' : ''}`}
          >
            {menu.label}
          </button>
        </div>
      ))}

      {open != null && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
          className="z-50 min-w-[180px] bg-white border border-gray-200 rounded shadow-lg py-1"
        >
          {menus[open].items.map((item, ii) => {
            if (item.type === 'separator') return <div key={ii} className="my-1 border-t border-gray-100" />;
            if (item.type === 'submenu') return <SubMenu key={ii} item={item} close={close} />;
            return <div key={ii}>{renderAction(item, close)}</div>;
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
