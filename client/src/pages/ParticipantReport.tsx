import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X, Printer } from 'lucide-react';
import api from '../services/api';
import { imageSrc } from '../utils/uploadImage';

/**
 * One student's session, for the teacher: score and rank, then every question
 * with what they chose next to what was right. Printable, to hand to a parent.
 */

interface Answer {
  selectedOption: number;
  selectedOptions: number[];
  answerText: string | null;
  isCorrect: boolean;
}

interface ReportQuestion {
  id: string;
  order: number;
  type: string;
  text: string;
  options: string[];
  imageUrl: string | null;
  imageAlt?: string | null;
  correctOption: number | null;
  correctOptions: number[];
  answer: Answer | null;
}

interface Report {
  event: { id: string; title: string; sessionMode: string };
  participant: { name: string };
  score: number;
  rank: number;
  totalParticipants: number;
  questions: ReportQuestion[];
}

const hasKey = (q: ReportQuestion) => q.correctOption !== null || q.correctOptions.length > 0;

/** Their answer, in words. */
const chosen = (q: ReportQuestion): string => {
  const a = q.answer;
  if (!a) return 'Did not answer';
  if (a.answerText) return a.answerText;
  if (q.type === 'MULTI_SELECT' || q.type === 'RANKING') {
    return a.selectedOptions.map((i) => q.options[i] ?? '?').join(q.type === 'RANKING' ? ' → ' : ', ') || '—';
  }
  return q.options[a.selectedOption] ?? '—';
};

/** The right answer, in words. */
const right = (q: ReportQuestion): string =>
  q.type === 'MULTI_SELECT' || q.type === 'RANKING'
    ? q.correctOptions.map((i) => q.options[i]).join(q.type === 'RANKING' ? ' → ' : ', ')
    : q.options[q.correctOption ?? -1] ?? '';

const ParticipantReport: React.FC = () => {
  const { id, pid } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [onlyMissed, setOnlyMissed] = useState(false);

  useEffect(() => {
    api
      .get(`/analytics/events/${id}/participants/${pid}`)
      .then((res) => setReport(res.data))
      .catch(() => setFailed(true));
  }, [id, pid]);

  if (failed) return <p className="p-10 text-center text-gray-600">This report could not be loaded.</p>;
  if (!report) return <p className="p-10 text-center text-gray-500">Loading…</p>;

  const graded = report.event.sessionMode !== 'SURVEY';
  const missed = report.questions.filter((q) => graded && hasKey(q) && !q.answer?.isCorrect);
  const shown = onlyMissed ? missed : report.questions;

  return (
    <div className="min-h-screen bg-paper print:bg-white">
      <div className="max-w-3xl mx-auto px-5 py-10 print:p-0">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <Link to={`/events/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
            <ArrowLeft className="w-4 h-4" /> Back to the session
          </Link>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{report.event.title}</p>
          <h1 className="font-heading text-4xl font-bold text-ink mt-1">{report.participant.name || 'Anonymous'}</h1>
          {graded && (
            <p className="mt-3 text-lg text-ink-soft tabular">
              {report.score} {report.score === 1 ? 'point' : 'points'} · ranked {report.rank} of {report.totalParticipants} ·{' '}
              {missed.length === 0 ? 'nothing missed' : `${missed.length} to go over`}
            </p>
          )}
        </header>

        {graded && missed.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink mb-5 print:hidden">
            <input type="checkbox" checked={onlyMissed} onChange={(e) => setOnlyMissed(e.target.checked)} />
            Show only what {report.participant.name || 'they'} missed
          </label>
        )}

        <ol className="space-y-4">
          {shown.map((q) => {
            const scored = graded && hasKey(q);
            const ok = q.answer?.isCorrect;
            return (
              <li key={q.id} className="card bg-surface border border-line rounded-2xl p-5 break-inside-avoid">
                <div className="flex items-start gap-3">
                  <span className="text-sm font-bold text-faint tabular pt-0.5">{q.order}</span>
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-ink">{q.text}</p>
                    {q.imageUrl && <img src={imageSrc(q.imageUrl)} alt={q.imageAlt || ''} className="max-h-40 object-contain rounded-xl" />}
                    <p className="text-sm">
                      <span className="text-muted">Answered: </span>
                      <span className={scored ? (ok ? 'text-[color:var(--color-correct)] font-semibold' : 'text-wrong font-semibold') : 'text-ink'}>
                        {chosen(q)}
                      </span>
                    </p>
                    {scored && !ok && (
                      <p className="text-sm">
                        <span className="text-muted">Right answer: </span>
                        <span className="font-semibold text-ink">{right(q)}</span>
                      </p>
                    )}
                  </div>
                  {scored &&
                    (ok ? (
                      <Check className="w-5 h-5 text-[color:var(--color-correct)] shrink-0" aria-label="Correct" />
                    ) : (
                      <X className="w-5 h-5 text-wrong shrink-0" aria-label="Missed" />
                    ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

export default ParticipantReport;
