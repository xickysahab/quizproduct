import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import { spring } from '../utils/motion';

/**
 * The one modal surface. On a phone it is a bottom sheet you can drag down to
 * dismiss; on a wider screen it materialises in place over a dimming scrim.
 *
 * A modal task dims and pushes the page back — that is what the scrim is for.
 * Dismissal is decided by where the drag was *going*, not where it stopped:
 * the release velocity is projected forward, the way a flick keeps sliding.
 */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Small caps line above the title. */
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  /** Widest the panel gets on a large screen. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Pinned under the content — the primary action lives here. */
  footer?: React.ReactNode;
}

const WIDTH = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

/** Where a flick would come to rest (Apple's projection, deceleration 0.998). */
const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

const useIsPhone = () => {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
};

const Sheet: React.FC<SheetProps> = ({ open, onClose, title, eyebrow, children, size = 'md', footer }) => {
  const phone = useIsPhone();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  // Callers pass a fresh onClose every render; reading it through a ref keeps
  // the effect below from re-running (and re-focusing) on every keystroke.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    // The page behind a modal task holds still.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus lands inside, so keyboard and screen-reader users start in the sheet.
    const t = setTimeout(() => {
      panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-sheet-close])')?.focus();
    }, 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
    };
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const height = panel.current?.offsetHeight ?? 600;
    const resting = info.offset.y + project(info.velocity.y);
    if (resting > height * 0.4) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
          <motion.div
            className="absolute inset-0 scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`relative w-full ${WIDTH[size]} max-h-[92dvh] sm:max-h-[88vh] flex flex-col bg-surface rounded-t-[22px] sm:rounded-[22px] shadow-xl border border-line/60`}
            // Enter and leave along the same path: up from the bottom on a
            // phone, in place on a wider screen.
            initial={phone ? { y: '100%' } : { opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
            animate={phone ? { y: 0 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={phone ? { y: '100%' } : { opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
            transition={spring}
            drag={phone ? 'y' : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            // Past the top it resists rather than stopping dead.
            dragElastic={{ top: 0.08, bottom: 1 }}
            dragTransition={{ bounceStiffness: 400, bounceDamping: 32 }}
            onDragEnd={onDragEnd}
          >
            {phone && (
              <div
                className="pt-2.5 pb-1 flex justify-center touch-none cursor-grab"
                onPointerDown={(e) => drag.start(e)}
              >
                <span className="h-1.5 w-10 rounded-full bg-gray-300" />
              </div>
            )}

            {(title || eyebrow) && (
              <div
                className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6 pb-4 touch-none sm:touch-auto"
                onPointerDown={(e) => phone && drag.start(e)}
              >
                <div className="min-w-0">
                  {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
                  {title && <h2 className="text-2xl font-bold text-ink">{title}</h2>}
                </div>
                <button
                  data-sheet-close
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-900 grid place-items-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>

            {footer && (
              <div className="px-6 py-4 border-t border-line pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Sheet;
