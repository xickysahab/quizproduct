import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 36, className = '' }) => {
  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
      >
        {/* Background circle with gradient */}
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="100%" stopColor="#4338CA" />
          </linearGradient>
          <linearGradient id="boltGrad" x1="18" y1="8" x2="30" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#logoGrad)" />
        {/* Lightning bolt / pulse icon */}
        <path
          d="M27 8L17 26H23L21 40L31 22H25L27 8Z"
          fill="url(#boltGrad)"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default Logo;
