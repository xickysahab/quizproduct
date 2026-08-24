import { useCallback, useEffect, useState } from 'react';
import { LANGUAGES, detectLanguage, setLanguage, translate } from './index';
import { loadScriptFont } from './scriptFonts';
import type { LanguageCode, TranslationKey } from './index';

/**
 * Language state for the participant screens.
 *
 * A tiny subscription rather than React context: the language is read in three
 * places and changes about once a session, so context and a provider would be
 * more machinery than the problem needs.
 */

type Listener = (code: LanguageCode) => void;
const listeners = new Set<Listener>();
let current: LanguageCode | null = null;

const get = (): LanguageCode => {
  if (!current) {
    current = detectLanguage();
    // Pull the script's face in for whatever we detected, not only for a
    // language the participant picks by hand.
    loadScriptFont(current);
  }
  return current;
};

export const useTranslation = () => {
  const [code, setCode] = useState<LanguageCode>(get);

  useEffect(() => {
    const listener: Listener = (next) => setCode(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(code, key, vars),
    [code]
  );

  const change = useCallback((next: LanguageCode) => {
    current = next;
    setLanguage(next);
    loadScriptFont(next);
    listeners.forEach((listener) => listener(next));
  }, []);

  return { t, language: code, setLanguage: change, languages: LANGUAGES };
};
