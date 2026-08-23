import React from 'react';
import Logo from './Logo';
import { brandTint, type RoomBranding } from '../utils/branding';

interface BrandedHeaderProps {
  branding: RoomBranding | null;
  /** Trailing controls (language, connection, room code). */
  trailing?: React.ReactNode;
  className?: string;
  /** `stage` sits on the dark live background. */
  tone?: 'light' | 'stage';
}

/**
 * Shared join/live chrome. Falls back to QuizPulse when the org has no logo.
 */
const BrandedHeader: React.FC<BrandedHeaderProps> = ({
  branding,
  trailing,
  className = '',
  tone = 'light',
}) => {
  const accent = branding?.primaryColor || undefined;
  const tint = brandTint(accent, 0.1);
  const stage = tone === 'stage';

  return (
    <div
      className={`flex items-center justify-between px-5 py-2.5 rounded-2xl backdrop-blur-xl ${
        stage
          ? 'bg-white/8 border border-white/12 text-white'
          : 'bg-white/80 border border-gray-200 shadow-sm'
      } ${className}`}
      style={
        !stage && tint ? { borderColor: brandTint(accent, 0.35), backgroundColor: tint } : undefined
      }
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.name || 'Organization'}
            className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-100"
          />
        ) : (
          <Logo size={20} />
        )}
        <span
          className={`font-heading font-bold text-sm truncate ${
            stage ? 'text-white' : 'text-gray-900'
          }`}
        >
          {branding?.name || 'QuizPulse'}
        </span>
      </div>
      {trailing ? <div className="flex items-center gap-3 text-xs shrink-0">{trailing}</div> : null}
    </div>
  );
};

export default BrandedHeader;
