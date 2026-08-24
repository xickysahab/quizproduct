import type { LanguageCode } from './index';

/**
 * Indic web fonts, loaded only when they are actually needed.
 *
 * Without a real face in the stack, Devanagari and Tamil fall back to whatever
 * the browser can find and the participant screen looks broken. Loading all six
 * up front would be the obvious fix and the wrong one: this product runs on
 * cheap phones on congested venue networks, and five scripts nobody in the room
 * reads is pure weight.
 *
 * So each script is fetched the moment someone selects that language, once, and
 * never again. Android already ships Noto system-wide, so most participants
 * never download anything at all — the stack simply resolves.
 */

const FAMILIES: Partial<Record<LanguageCode, string>> = {
  hi: 'Noto+Sans+Devanagari',
  mr: 'Noto+Sans+Devanagari',
  bn: 'Noto+Sans+Bengali',
  ta: 'Noto+Sans+Tamil',
  te: 'Noto+Sans+Telugu',
  gu: 'Noto+Sans+Gujarati',
  kn: 'Noto+Sans+Kannada',
};

/** Font-family names, in the order the CSS stack should try them. */
const STACK: Partial<Record<LanguageCode, string>> = {
  hi: '"Noto Sans Devanagari"',
  mr: '"Noto Sans Devanagari"',
  bn: '"Noto Sans Bengali"',
  ta: '"Noto Sans Tamil"',
  te: '"Noto Sans Telugu"',
  gu: '"Noto Sans Gujarati"',
  kn: '"Noto Sans Kannada"',
};

const loaded = new Set<string>();

export const loadScriptFont = (code: LanguageCode): void => {
  const family = FAMILIES[code];

  // Latin needs nothing extra, and a repeat selection should not re-request.
  if (!family || loaded.has(family)) {
    applyStack(code);
    return;
  }

  loaded.add(family);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);

  applyStack(code);
};

/**
 * Puts the script's face at the front of the running stack.
 *
 * Latin glyphs still come from Public Sans — the Noto face only supplies the
 * characters the Latin font has no coverage for, which keeps mixed strings like
 * "QuizPulse — हिन्दी" from switching typeface mid-sentence.
 */
const applyStack = (code: LanguageCode): void => {
  const face = STACK[code];
  const root = document.documentElement;

  if (!face) {
    root.style.removeProperty('--font-sans');
    root.style.removeProperty('--font-display');
    return;
  }

  root.style.setProperty(
    '--font-sans',
    `"Public Sans", ${face}, system-ui, sans-serif`
  );
  root.style.setProperty(
    '--font-display',
    `"Familjen Grotesk", ${face}, "Public Sans", system-ui, sans-serif`
  );
};
