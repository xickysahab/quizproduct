/**
 * Shared feel for the class pages.
 *
 * One spring for everything: critically damped (no overshoot), 0.4s response.
 * Nothing here is flicked, so nothing earns a bounce.
 */
export const spring = { type: 'spring', bounce: 0, duration: 0.4 } as const;

/** Enter and leave along the same path. */
export const rise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: spring,
};

/** Feedback on press, not on release. */
export const press = 'transition-transform duration-100 ease-out active:scale-[0.97]';

export const field =
  'w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-[15px] outline-none transition-shadow focus:bg-white focus:ring-2 focus:ring-accent focus:border-transparent';

export const label = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5';

/** Mirrors the server: letters/digits, no 0/O/1/I, six long; accepts a pasted link. */
const CLASS_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export const normalizeClassCode = (input: string): string =>
  (input.trim().split('/').pop() || '').replace(/[\s-]/g, '').toUpperCase();
export const isClassCode = (code: string): boolean => CLASS_CODE.test(code);

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
