'use client';

import { useState, useEffect, useRef } from 'react';

export type MenuSeparator = { type: 'separator' };
export type MenuAction = {
  type: 'item';
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
};
export type MenuItem = MenuAction | MenuSeparator;
export type MenuDef = { label: string; items: MenuItem[] };

interface Props {
  menus: MenuDef[];
}

export default function MenuBar({ menus }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open == null) return;
    function onDown(e: MouseEvent) {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={barRef} className="relative flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-sm select-none">
      {menus.map((menu, mi) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === mi ? null : mi)}
            onMouseEnter={() => { if (open != null) setOpen(mi); }}
            className={`px-2.5 py-0.5 rounded text-gray-700 hover:bg-gray-200 transition-colors ${open === mi ? 'bg-gray-200' : ''}`}
          >
            {menu.label}
          </button>

          {open === mi && (
            <div className="absolute left-0 top-full mt-0.5 z-50 min-w-[180px] bg-white border border-gray-200 rounded shadow-lg py-1">
              {menu.items.map((item, ii) => {
                if (item.type === 'separator') {
                  return <div key={ii} className="my-1 border-t border-gray-100" />;
                }
                return (
                  <button
                    key={ii}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => { setOpen(null); item.onClick(); }}
                    className="flex items-center justify-between w-full px-4 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default gap-6"
                  >
                    <span className="flex items-center gap-2">
                      {item.checked != null && (
                        <span className="w-3 text-xs">{item.checked ? '✓' : ''}</span>
                      )}
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <span className="text-xs text-gray-400 flex-none">{item.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
