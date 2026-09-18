import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: React.ElementType;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * A menu that grows out of the button that opened it — its origin is the
 * trigger's corner, so where it came from is never in doubt. Items are groups;
 * a divider sits between groups, and anything destructive goes last.
 */
const MenuButton: React.FC<{ groups: MenuItem[][]; label?: string }> = ({ groups, label = 'More actions' }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-10 h-10 rounded-full grid place-items-center bg-gray-100 text-ink hover:bg-gray-200"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-12 z-40 w-64 material-sheet rounded-2xl border border-line/60 p-1.5"
          >
            {groups.map((group, g) => (
              <div key={g} className={g > 0 ? 'border-t border-line mt-1.5 pt-1.5' : ''}>
                {group.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        item.onSelect();
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] text-[15px] text-left ${
                        item.destructive ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                      {Icon && <Icon className="w-4 h-4 shrink-0 opacity-80" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MenuButton;
