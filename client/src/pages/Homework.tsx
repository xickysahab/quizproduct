import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useTranslation } from '../i18n/useTranslation';
import LanguagePicker from '../components/LanguagePicker';
import { imageSrc } from '../utils/uploadImage';
import type { LiveQuestion } from '../types/analytics';

/**
 * Homework: the participant works through the questions alone, one at a time,
 * one try each. No host, no timer, no live results — the teacher reads the
 * per-student report in the morning.
 */

interface Sheet {
  title: string;
  closesAt: string | null;
  scored: boolean;
  questions: LiveQuestion[];
  answered: string[];
}

/** Stable per participant and question, so a reload does not reshuffle. */
const shuffledOrder = (length: number, seedText: string): number[] => {
  let seed = [...seedText].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

const Homework: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [closed, setClosed] = useState(false);
  const [single, setSingle] = useState<number | null>(null);
  const [multi, setMulti] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [ranking, setRanking] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const participantId = localStorage.getItem('participantId') || '';

  useEffect(() => {
    if (!localStorage.getItem('participantToken')) {
      navigate('/');
      return;
    }
    api
      .get('/participants/homework')
      .then((res) => setSheet(res.data))
      .catch(() => setClosed(true));
  }, [navigate]);

  const remaining = sheet ? sheet.questions.filter((q) => !sheet.answered.includes(q.id)) : [];
  const question = remaining[0] ?? null;
  const position = sheet && question ? sheet.questions.indexOf(question) + 1 : 0;

  // Options are shown in a shuffled order so neighbours cannot copy by
  // position. A rating scale keeps its order; a ranking starts as written.
  const order = useMemo(() => {
    if (!question) return [];
    const n = question.options.length;
    return question.type === 'MCQ' || question.type === 'MULTI_SELECT'
      ? shuffledOrder(n, participantId + question.id)
      : Array.from({ length: n }, (_, i) => i);
  }, [question, participantId]);

  useEffect(() => {
    setSingle(null);
    setMulti([]);
    setText('');
    setRanking(order);
  }, [order]);

  const done = sheet !== null && !question;

  useEffect(() => {
    if (done && sheet?.scored) {
      api.get('/participants/me').then((res) => setScore(res.data.score ?? null)).catch(() => undefined);
    }
  }, [done, sheet?.scored]);

  const submit = async () => {
    if (!question || !sheet) return;
    const body: Record<string, unknown> = { questionId: question.id };
    if (question.type === 'OPEN_TEXT' || question.type === 'WORD_CLOUD') body.answerText = text;
    else if (question.type === 'MULTI_SELECT') body.selectedOptions = multi;
    else if (question.type === 'RANKING') body.rankedOptions = ranking;
    else body.selectedOption = single;

    setSaving(true);
    try {
      await api.post('/participants/response', body);
      setSheet({ ...sheet, answered: [...sheet.answered, question.id] });
    } catch (error) {
      const res = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
      // Already answered on another tab: move on rather than trap them here.
      if (res?.status === 409) setSheet({ ...sheet, answered: [...sheet.answered, question.id] });
      else toast.error(res?.data?.message || 'Could not save that answer.');
    } finally {
      setSaving(false);
    }
  };

  const ready =
    question &&
    (question.type === 'OPEN_TEXT' || question.type === 'WORD_CLOUD'
      ? text.trim().length > 0
      : question.type === 'MULTI_SELECT'
        ? multi.length > 0
        : question.type === 'RANKING'
          ? true
          : single !== null);

  const move = (from: number, to: number) =>
    setRanking((prev) => {
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const tile = (on: boolean) =>
    `w-full text-left px-5 py-4 rounded-2xl border font-semibold flex items-center justify-between ${
      on ? 'bg-accent text-white border-accent' : 'bg-white/8 border-white/15 text-white'
    }`;

  return (
    <div className="min-h-screen bg-[color:var(--color-stage)] text-white px-5 py-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.22em] uppercase text-accent-lift">{t('hw.eyebrow')}</span>
          <LanguagePicker compact tone="dark" />
        </div>

        {closed && <p className="text-lg text-white/80">{t('hw.closed')}</p>}

        {sheet && (
          <header>
            <h1 className="font-heading text-2xl font-bold">{sheet.title}</h1>
            {sheet.closesAt && (
              <p className="text-sm text-white/60 mt-1">
                {t('hw.due', { when: new Date(sheet.closesAt).toLocaleString() })}
              </p>
            )}
          </header>
        )}

        {done && (
          <div className="rounded-[1.6rem] bg-white/8 border border-white/10 p-7 space-y-2">
            <Check className="w-8 h-8 text-accent-lift" />
            <h2 className="font-heading text-2xl font-bold">{t('hw.doneTitle')}</h2>
            <p className="text-white/80">{t('hw.doneBody')}</p>
            {score !== null && <p className="text-white/80">{t('hw.score', { score })}</p>}
          </div>
        )}

        {question && sheet && (
          <div className="space-y-5">
            <div className="rounded-[1.6rem] bg-white/8 border border-white/10 p-6 space-y-3">
              <span className="text-xs text-white/60 tabular">
                {t('hw.progress', { n: position, total: sheet.questions.length })}
              </span>
              <h2 className="font-heading text-2xl font-bold leading-snug">{question.text}</h2>
              {question.imageUrl && (
                <img src={imageSrc(question.imageUrl)} alt="" className="w-full max-h-72 object-contain rounded-2xl" />
              )}
            </div>

            {(question.type === 'OPEN_TEXT' || question.type === 'WORD_CLOUD') && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t(question.type === 'WORD_CLOUD' ? 'live.wordPlaceholder' : 'live.textPlaceholder')}
                className="w-full min-h-28 rounded-2xl bg-white text-gray-900 p-4 outline-none"
              />
            )}

            {(question.type === 'MCQ' || question.type === 'RATING') && (
              <div className="space-y-3">
                {order.map((i) => (
                  <button key={i} onClick={() => setSingle(i)} className={tile(single === i)}>
                    {question.options[i]}
                  </button>
                ))}
              </div>
            )}

            {question.type === 'MULTI_SELECT' && (
              <div className="space-y-3">
                {order.map((i) => (
                  <button
                    key={i}
                    aria-pressed={multi.includes(i)}
                    onClick={() => setMulti((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
                    className={tile(multi.includes(i))}
                  >
                    {question.options[i]}
                    {multi.includes(i) && <Check className="w-5 h-5" />}
                  </button>
                ))}
              </div>
            )}

            {question.type === 'RANKING' && (
              <div className="space-y-3">
                <p className="text-sm text-white/60">{t('hw.rankHint')}</p>
                {ranking.map((i, pos) => (
                  <div key={i} className={`${tile(false)} gap-3`}>
                    <span className="tabular text-white/50">{pos + 1}</span>
                    <span className="flex-1">{question.options[i]}</span>
                    <button aria-label="Move up" disabled={pos === 0} onClick={() => move(pos, pos - 1)} className="disabled:opacity-30">
                      <ArrowUp className="w-5 h-5" />
                    </button>
                    <button
                      aria-label="Move down"
                      disabled={pos === ranking.length - 1}
                      onClick={() => move(pos, pos + 1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowDown className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-white/50">{t('hw.oneTry')}</p>
            <button
              onClick={submit}
              disabled={!ready || saving}
              className="w-full gradient-btn text-white font-bold py-4 rounded-2xl disabled:opacity-40"
            >
              {t('live.submitAnswer')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Homework;
