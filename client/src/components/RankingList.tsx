import React from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { springMomentum } from '../utils/motion';

/**
 * Drag to rank.
 *
 * This was two arrow buttons per row. Ranking four options into order took up
 * to six taps on a phone, against a countdown — the interaction was the reason
 * the question type was slow, not the thinking.
 *
 * Reorder is framer-motion's, not hand-rolled, and it already does what fluid
 * dragging requires: the row tracks the finger 1:1, the spring animates from
 * wherever the row currently *is* rather than from its logical slot, and a
 * drag can be grabbed and reversed mid-flight. Reimplementing pointer capture,
 * velocity history and momentum projection to get the same result would be
 * two hundred lines that behave slightly worse.
 *
 * Dragging is a pointer gesture, so the keyboard needs its own path or the
 * question becomes unanswerable without a mouse. Arrow keys move the focused
 * row, which is also how a screen reader user reorders it.
 */

interface Props {
  /** Option indices, in the participant's current order. */
  order: number[];
  options: string[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}

const move = (list: number[], from: number, to: number): number[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [lifted] = next.splice(from, 1);
  next.splice(to, 0, lifted!);
  return next;
};

const Row: React.FC<{
  optionIndex: number;
  position: number;
  label: string;
  total: number;
  disabled: boolean;
  onMove: (to: number) => void;
}> = ({ optionIndex, position, label, total, disabled, onMove }) => {
  // The handle starts the drag, so the row itself stays scrollable — a list
  // that hijacks every downward swipe traps the page behind it.
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={optionIndex}
      dragListener={false}
      dragControls={controls}
      // Momentum-driven, so a little overshoot is right here — the row was
      // thrown, and stopping dead would read as hitting a wall.
      transition={springMomentum}
      whileDrag={{
        scale: 1.03,
        boxShadow: '0 18px 40px -12px rgba(26, 22, 20, 0.28)',
        cursor: 'grabbing',
        zIndex: 1,
      }}
      tabIndex={disabled ? -1 : 0}
      role="option"
      aria-label={`${label}, position ${position + 1} of ${total}`}
      aria-selected={false}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMove(position - 1);
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMove(position + 1);
        }
      }}
      className="w-full p-3.5 rounded-2xl border border-line bg-surface flex items-center gap-3 select-none focus-visible:ring-2 focus-visible:ring-accent outline-none"
      style={{ touchAction: 'none' }}
    >
      <span className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center flex-shrink-0 tabular">
        {position + 1}
      </span>

      <span className="flex-1 text-left text-ink">{label}</span>

      <span
        onPointerDown={(event) => !disabled && controls.start(event)}
        className={`flex-shrink-0 p-1.5 -mr-1 text-faint ${disabled ? '' : 'cursor-grab active:cursor-grabbing touch-none'}`}
        aria-hidden="true"
      >
        <GripVertical className="w-5 h-5" />
      </span>
    </Reorder.Item>
  );
};

const RankingList: React.FC<Props> = ({ order, options, onChange, disabled = false }) => (
  <Reorder.Group
    axis="y"
    values={order}
    onReorder={onChange}
    role="listbox"
    aria-label="Drag or use arrow keys to rank these"
    className="space-y-2.5"
  >
    {order.map((optionIndex, position) => (
      <Row
        key={optionIndex}
        optionIndex={optionIndex}
        position={position}
        total={order.length}
        label={options[optionIndex] ?? ''}
        disabled={disabled}
        onMove={(to) => onChange(move(order, position, to))}
      />
    ))}
  </Reorder.Group>
);

export default RankingList;
