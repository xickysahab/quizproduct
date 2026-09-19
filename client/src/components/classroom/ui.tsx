import React, { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Check } from 'lucide-react';
import { Morph } from 'cube-motion/react';
import { press, spring } from './style';

/** Honours the OS "reduce motion" setting for everything inside. */
export const Motion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user" transition={spring}>
    {children}
  </MotionConfig>
);

/** A button whose own icon confirms the copy, right where the eye already is. */
export const CopyButton: React.FC<{ text: string; children: React.ReactNode; icon: React.ElementType }> = ({
  text,
  children,
  icon: Icon,
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this:', text);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`${press} inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium ${
        copied ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-wash text-accent hover:brightness-95'
      }`}
    >
      {copied ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      <Morph active={copied} off={children} on="Copied" />
    </button>
  );
};

export const SkeletonCards: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="h-36 rounded-2xl bg-white border border-gray-200 p-6 space-y-3">
        <div className="h-5 w-2/3 rounded-md bg-gray-100 motion-safe:animate-pulse" />
        <div className="h-4 w-1/3 rounded-md bg-gray-100 motion-safe:animate-pulse" />
        <div className="h-4 w-1/2 rounded-md bg-gray-100 motion-safe:animate-pulse mt-6" />
      </div>
    ))}
  </div>
);
