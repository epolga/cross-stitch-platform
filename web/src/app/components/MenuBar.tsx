'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  function openSubmenu() {
    const btn = triggerRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.right + 2 });
    }
    setOpen(true);
  }

  // Click-to-toggle (not just hover) — hover alone doesn't fire reliably on
  // touch devices, which was leaving this submenu unopenable on phones.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Same on-screen clamping as the top-level dropdown (see MenuBar's own
  // useLayoutEffect) — plus flipping to the trigger's left edge instead of
  // its right when there's no room, since a submenu normally opens further
  // right than its parent and runs off narrow screens first.
  useLayoutEffect(() => {
    if (!open || !popupRef.current || !triggerRef.current) return;
    const margin = 8;
    const trigger = triggerRef.current.getBoundingClientRect();
    const popup = popupRef.current.getBoundingClientRect();
    let nextTop = popup.top;
    let nextLeft = popup.left;
    if (popup.right > window.innerWidth - margin) {
      nextLeft = trigger.left - popup.width - 2;
    }
    const overflow = popup.bottom - (window.innerHeight - margin);
    if (overflow > 0) {
      nextTop = Math.max(margin, popup.top - overflow);
    }
    if (nextTop !== popup.top || nextLeft !== popup.left) {
      setPos({ top: nextTop, left: nextLeft });
    }
  }, [open]);

  return (
    <div className="relative" onMouseEnter={() => { if (!open) openSubmenu(); }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (open) setOpen(false); else openSubmenu(); }}
        className="flex items-center justify-between w-full px-4 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 gap-6"
      >
        <span>{item.label}</span>
        <span className="text-xs text-gray-400 flex-none">▶</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={popupRef}
          data-menubar-popup
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
          }}
          className="min-w-[160px] bg-white border border-gray-200 rounded shadow-lg py-1 z-50"
        >
          {item.items.map((sub, si) => {
            if (sub.type === 'separator') return <div key={si} className="my-1 border-t border-gray-100" />;
            return <div key={si}>{renderAction(sub, close)}</div>;
          })}
        </div>,
        document.body
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
      // A submenu (Flip/Mirror/Rotate) renders through its own portal, so
      // it's not inside dropdownRef's subtree — without this check, tapping
      // a submenu item would close the whole menu (mousedown fires first)
      // before the item's own onClick ever gets to run.
      if (target instanceof HTMLElement && target.closest('[data-menubar-popup]')) return;
      setOpen(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Position is only computed once, at open time. Closing on resize/orientation
  // change (phone rotation, on-screen keyboard opening/closing the viewport)
  // avoids leaving a stale, detached-looking menu rather than trying to
  // recompute a fixed-position popup's coordinates mid-interaction.
  useEffect(() => {
    if (open == null) return;
    function onResize() { setOpen(null); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // On short/narrow viewports (phone simulation, small windows) a long menu
  // like View can extend past the bottom of the screen, and a menu whose
  // trigger sits near the right edge of the (horizontally-scrolling) bar —
  // e.g. Import, Help — can extend past the right edge too. position:fixed
  // doesn't get clipped by any parent, but nothing pulls it back on-screen
  // either. Once the dropdown has actually rendered (and we know its real
  // size), nudge it back so it stays fully within the viewport.
  useLayoutEffect(() => {
    if (open == null || !dropdownRef.current) return;
    const margin = 8;
    const rect = dropdownRef.current.getBoundingClientRect();
    const bottomOverflow = rect.bottom - (window.innerHeight - margin);
    const rightOverflow = rect.right - (window.innerWidth - margin);
    if (bottomOverflow > 0 || rightOverflow > 0) {
      setDropdownPos(pos => pos ? {
        top: bottomOverflow > 0 ? Math.max(margin, pos.top - bottomOverflow) : pos.top,
        left: rightOverflow > 0 ? Math.max(margin, pos.left - rightOverflow) : pos.left,
      } : pos);
    }
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
          data-menubar-popup
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
          }}
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
