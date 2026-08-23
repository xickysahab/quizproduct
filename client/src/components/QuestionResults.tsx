import React from 'react';
import { motion } from 'framer-motion';
import type { QuestionTally } from '../types/analytics';

/**
 * Renders one question's real results.
 *
 * The conclude screen used to draw every chart from a hardcoded four-item
 * agree/disagree preset, so a question about cities displayed "Strongly Agree /
 * Agree / Disagree / Strongly Disagree" beside its own vote counts. Everything
 * here comes from the question's own options.
 */

/** Fallback series colours, used when no branding palette is supplied. */
const SERIES = ['#6366F1', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#8B5CF6', '#14B8A6', '#EC4899'];

const colourFor = (index: number, palette?: string[]): string =>
  palette?.[index] || SERIES[index % SERIES.length] || '#6366F1';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

interface Props {
  tally: QuestionTally;
  /** Optional brand palette, one colour per option. */
  palette?: string[];
  /** Marks the right answer. Off during a live poll, on once results are shown. */
  revealCorrect?: boolean;
  compact?: boolean;
}

const isCorrectOption = (tally: QuestionTally, index: number): boolean => {
  if (tally.correctOptions && tally.correctOptions.length > 0) {
    return tally.correctOptions.includes(index);
  }
  return tally.correctOption === index;
};

const WordCloud: React.FC<{ tally: QuestionTally }> = ({ tally }) => {
  if (tally.words.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">No responses yet.</p>
    );
  }

  const top = tally.words[0]?.count || 1;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      {tally.words.map((entry, index) => {
        // Scale by frequency, floored so a one-off answer stays readable.
        const weight = entry.count / top;
        const size = 0.95 + weight * 1.9;
        return (
          <motion.span
            key={entry.word}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: Math.min(index * 0.02, 0.4) }}
            className="font-semibold leading-none"
            style={{
              fontSize: `${size}rem`,
              color: colourFor(index),
              opacity: 0.55 + weight * 0.45,
            }}
            title={`${entry.word} — ${entry.count} ${entry.count === 1 ? 'mention' : 'mentions'}`}
          >
            {entry.word}
          </motion.span>
        );
      })}
    </div>
  );
};

const TextAnswers: React.FC<{ tally: QuestionTally }> = ({ tally }) => {
  if (tally.textAnswers.length === 0) {
    return <p className="text-sm text-gray-500 italic">No responses yet.</p>;
  }

  return (
    <ul className="space-y-2 max-h-72 overflow-y-auto">
      {tally.textAnswers.map((answer, index) => (
        <li
          key={`${index}-${answer.slice(0, 12)}`}
          className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
        >
          {answer}
        </li>
      ))}
    </ul>
  );
};

const QuestionResults: React.FC<Props> = ({ tally, palette, revealCorrect = false, compact = false }) => {
  const isText = tally.type === 'OPEN_TEXT' || tally.type === 'WORD_CLOUD';

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h3 className="font-heading text-xl font-bold text-gray-900 leading-snug flex-1 min-w-[200px]">
            {tally.text}
          </h3>
          <span className="text-xs font-semibold text-gray-500 whitespace-nowrap bg-gray-100 px-3 py-1 rounded-full">
            {tally.totalResponses} {tally.totalResponses === 1 ? 'response' : 'responses'}
          </span>
        </div>
      )}

      {tally.type === 'WORD_CLOUD' && <WordCloud tally={tally} />}
      {tally.type === 'OPEN_TEXT' && <TextAnswers tally={tally} />}

      {!isText && (
        <div className="space-y-3">
          {tally.options.map((option, index) => {
            const count = tally.optionCounts[index] ?? 0;
            const pct = tally.percentages[index] ?? 0;
            const correct = revealCorrect && isCorrectOption(tally, index);
            const colour = correct ? '#10B981' : colourFor(index, palette);

            return (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-6 h-6 rounded-md text-[11px] font-bold text-white flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colour }}
                    >
                      {LETTERS[index] || index + 1}
                    </span>
                    <span className={`truncate ${correct ? 'font-bold text-emerald-700' : 'text-gray-700'}`}>
                      {option}
                    </span>
                    {correct && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex-shrink-0">
                        Correct
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 flex-shrink-0 tabular-nums">
                    <span className="font-bold text-base" style={{ color: colour }}>
                      {pct}%
                    </span>
                    <span className="text-xs text-gray-400">{count}</span>
                  </div>
                </div>

                <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: colour }}
                  />
                </div>
              </div>
            );
          })}

          {tally.type === 'MULTI_SELECT' && tally.totalResponses > 0 && (
            <p className="text-[11px] text-gray-400 pt-1">
              Participants could pick more than one option, so these can total over 100%.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionResults;
