import React from 'react';
import { Check } from 'lucide-react';
import { OPTION_LETTERS, optionTheme } from '../utils/optionTheme';

type Shape = 'triangle' | 'diamond' | 'circle' | 'square';

const SHAPES: Shape[] = ['triangle', 'diamond', 'circle', 'square'];

const ShapeMark: React.FC<{ shape: Shape; className?: string }> = ({ shape, className = '' }) => {
  if (shape === 'triangle') {
    return (
      <span
        className={`inline-block ${className}`}
        style={{
          width: 0,
          height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderBottom: '12px solid currentColor',
        }}
      />
    );
  }
  if (shape === 'diamond') {
    return <span className={`inline-block w-2.5 h-2.5 rotate-45 bg-current ${className}`} />;
  }
  if (shape === 'circle') {
    return <span className={`inline-block w-3 h-3 rounded-full bg-current ${className}`} />;
  }
  return <span className={`inline-block w-2.5 h-2.5 rounded-[3px] bg-current ${className}`} />;
};

interface OptionTileProps {
  index: number;
  label: string;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  /** `play` = phone tap target. `stage` = projector / host card. */
  size?: 'play' | 'stage';
  as?: 'button' | 'div';
  disabled?: boolean;
}

const OptionTile: React.FC<OptionTileProps> = ({
  index,
  label,
  selected = false,
  dimmed = false,
  onClick,
  size = 'play',
  as = onClick ? 'button' : 'div',
  disabled = false,
}) => {
  const theme = optionTheme(index);
  const shape = SHAPES[index % SHAPES.length]!;
  const letter = OPTION_LETTERS[index] || String(index + 1);
  const stage = size === 'stage';

  const className = [
    'w-full text-left font-semibold transition-all duration-150 flex items-center justify-between gap-3 border-2 option-tile',
    stage ? 'p-5 md:p-6 rounded-3xl text-lg md:text-xl' : 'p-4 md:p-[1.15rem] rounded-2xl text-base',
    selected ? 'text-white scale-[1.015] shadow-lg' : 'text-white/95',
    dimmed && !selected ? 'opacity-45' : '',
    onClick && !disabled ? 'active:scale-[0.98] cursor-pointer' : '',
    disabled ? 'cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style: React.CSSProperties = {
    backgroundColor: theme.fill,
    borderColor: selected ? '#fff' : 'transparent',
    boxShadow: selected ? `0 12px 28px -10px ${theme.fill}` : undefined,
  };

  const inner = (
    <>
      <div className="flex items-center gap-3.5 min-w-0">
        <span
          className={`flex-shrink-0 flex items-center justify-center text-white/95 ${
            stage ? 'w-12 h-12 rounded-2xl' : 'w-10 h-10 rounded-xl'
          }`}
          style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}
        >
          <span className="flex flex-col items-center gap-0.5 leading-none">
            <ShapeMark shape={shape} />
            <span className={`${stage ? 'text-xs' : 'text-[10px]'} font-bold`}>{letter}</span>
          </span>
        </span>
        <span className="truncate">{label}</span>
      </div>
      {selected && <Check className={`${stage ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0`} strokeWidth={3} />}
    </>
  );

  if (as === 'button') {
    return (
      <button type="button" disabled={disabled} onClick={onClick} className={className} style={style}>
        {inner}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {inner}
    </div>
  );
};

export default OptionTile;
