import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import type { LanguageCode } from '../i18n';

/**
 * Language selector for participants.
 *
 * Slido is English-only, which is a genuine problem in an Indian lecture hall
 * or a government training session. Each option is labelled in its own script,
 * because somebody looking for Tamil is looking for "தமிழ்", not "Tamil".
 */
const LanguagePicker: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, setLanguage, languages, t } = useTranslation();

  return (
    <label className={`inline-flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      <Languages className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('lang.label')}</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        className="bg-transparent border-none outline-none text-gray-600 font-medium cursor-pointer focus:ring-2 focus:ring-indigo-500 rounded"
      >
        {languages.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.native}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguagePicker;
