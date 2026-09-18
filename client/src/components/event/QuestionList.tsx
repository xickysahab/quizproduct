import React, { useEffect, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Check, Clock, GripVertical, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { imageSrc } from '../../utils/uploadImage';
import { springMomentum } from '../../utils/motion';

/**
 * The running order. Drag a question by its grip to move it — the row stays
 * under the finger and the others make room — and the new order is saved when
 * it is let go. Tapping anywhere else on the row opens it for editing.
 */

interface Question {
  id: string;
  text: string;
  type?: string;
  options?: string[];
  correctOption?: number | null;
  correctOptions?: number[];
  timeLimit?: number | null;
  imageUrl?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Multiple choice',
  MULTI_SELECT: 'Multi-select',
  OPEN_TEXT: 'Open text',
  WORD_CLOUD: 'Word cloud',
  RATING: 'Rating',
  RANKING: 'Ranking',
};

const letter = (i: number) => String.fromCharCode(65 + i);

const isRight = (q: Question, i: number) =>
  q.type === 'MULTI_SELECT' ? (q.correctOptions ?? []).includes(i) : q.correctOption === i;

const Row: React.FC<{
  q: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onDropped: () => void;
}> = ({ q, index, onEdit, onDelete, onDropped }) => {
  const drag = useDragControls();

  return (
    <Reorder.Item
      value={q}
      dragListener={false}
      dragControls={drag}
      onDragEnd={onDropped}
      transition={springMomentum}
      whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-lift)' }}
      className="list-none bg-surface rounded-2xl border border-line shadow-sm"
    >
      <div className="flex items-stretch">
        <button
          onPointerDown={(e) => drag.start(e)}
          aria-label={`Move question ${index + 1}`}
          className="touch-none cursor-grab active:cursor-grabbing px-2 sm:px-3 text-faint hover:text-muted grid place-items-center"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div
          role="button"
          tabIndex={0}
          onClick={onEdit}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEdit()}
          className="flex-1 min-w-0 py-4 pr-2 text-left cursor-pointer"
        >
          <div className="flex items-start gap-3">
            <span className="text-sm font-semibold text-faint tabular pt-0.5 w-6 shrink-0">{index + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[17px] font-semibold text-ink leading-snug">{q.text}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span>{TYPE_LABEL[q.type || 'MCQ'] ?? q.type}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {q.timeLimit ? `${q.timeLimit}s` : 'No timer'}
                </span>
                {q.imageUrl && (
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> Image
                  </span>
                )}
              </div>
              {!!q.options?.length && (
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {q.options.map((opt, i) => {
                    const right = isRight(q, i);
                    return (
                      <li
                        key={i}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] ${
                          right ? 'bg-accent-wash text-accent font-semibold' : 'bg-gray-100 text-ink-soft'
                        }`}
                      >
                        <span className="text-[11px] font-bold opacity-70">{letter(i)}</span>
                        {opt}
                        {right && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-label="correct" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {q.imageUrl && (
              <img src={imageSrc(q.imageUrl)} alt="" className="hidden sm:block w-16 h-16 rounded-xl object-cover shrink-0" />
            )}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-1 pr-2 sm:pr-3">
          <button onClick={onEdit} aria-label="Edit question" className="w-9 h-9 rounded-full grid place-items-center text-muted hover:bg-gray-100 hover:text-ink">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} aria-label="Delete question" className="w-9 h-9 rounded-full grid place-items-center text-muted hover:bg-red-50 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
};

const QuestionList: React.FC<{
  eventId: string;
  questions: Question[];
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
}> = ({ eventId, questions, onEdit, onDelete }) => {
  const [items, setItems] = useState(questions);
  useEffect(() => setItems(questions), [questions]);

  const save = async () => {
    const ids = items.map((q) => q.id);
    if (ids.join() === questions.map((q) => q.id).join()) return;
    try {
      await api.put(`/questions/event/${eventId}/reorder`, { questionIds: ids });
    } catch {
      toast.error('Could not save the new order.');
      setItems(questions);
    }
  };

  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-3">
      {items.map((q, i) => (
        <Row key={q.id} q={q} index={i} onEdit={() => onEdit(q)} onDelete={() => onDelete(q.id)} onDropped={save} />
      ))}
    </Reorder.Group>
  );
};

export default QuestionList;
