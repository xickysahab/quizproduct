import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Raisehand mark: a raised hand whose four fingers are poll bars of different
 * heights. Keep in step with public/favicon.svg.
 */
const Logo: React.FC<LogoProps> = ({ size = 36, className = '' }) => (
  <div
    className={`flex items-center justify-center ${className}`}
    style={{ width: size, height: size }}
  >
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      role="img"
      aria-label="Raisehand"
    >
      <rect width="48" height="48" rx="13" fill="#1A1614" />
      <g fill="#F97316" transform="translate(1.8 0)">
        <rect x="14" y="14" width="4.6" height="16" rx="2.3" />
        <rect x="19.6" y="9" width="4.6" height="21" rx="2.3" />
        <rect x="25.2" y="11.5" width="4.6" height="18.5" rx="2.3" />
        <rect x="30.8" y="16.5" width="4.6" height="13.5" rx="2.3" />
        <path d="M14 26h21.4v5.5a8.5 8.5 0 0 1-8.5 8.5h-4.4A8.5 8.5 0 0 1 14 31.5z" />
        <rect
          x="13.7"
          y="20"
          width="4.6"
          height="14"
          rx="2.3"
          transform="rotate(-35 16 33)"
        />
      </g>
      <circle cx="39" cy="10" r="3.2" fill="#14B8A6" />
    </svg>
  </div>
);

export default Logo;
