import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { LANGUAGES } from '../i18n';

const TYPES = [
  { id: 'MCQ', label: 'Multiple choice' },
  { id: 'MULTI_SELECT', label: 'Multi-select' },
  { id: 'OPEN_TEXT', label: 'Open text' },
];

/** Matches the server's ceiling, so a too-big file is refused before upload. */
const MAX_MB = 15;

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

interface Props {
  eventId: string;
  onClose: () => void;
  onDrafts: (drafts: any[]) => void;
}

const AiDraftModal: React.FC<Props> = ({ eventId, onClose, onDrafts }) => {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('en');
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<string[]>(['MCQ']);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Choose a PDF.');
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`The PDF must be under ${MAX_MB} MB.`);
    if (types.length === 0) return toast.error('Choose at least one question type.');

    setLoading(true);
    try {
      const pdfBase64 = await readBase64(file);
      const res = await api.post(`/questions/event/${eventId}/draft`, { pdfBase64, language, count, types });
      onDrafts(res.data.drafts);
      toast.success(`${res.data.drafts.length} questions drafted. Review them before they go live.`);
      onClose();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Could not draft questions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-xl border border-gray-200 my-8">
        <div className="flex justify-between items-center pb-5 mb-6 border-b border-gray-200">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">AI drafts</span>
            <h2 className="font-heading text-2xl font-bold text-gray-900">Draft questions from a chapter</h2>
          </div>
          <button onClick={onClose} className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-full border border-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Chapter PDF</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native} · {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Questions</span>
              <input
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 outline-none tabular"
              />
            </label>
          </div>

          <fieldset>
            <legend className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Types</legend>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => {
                const on = types.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTypes(on ? types.filter((x) => x !== t.id) : [...types, t.id])}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      on ? 'bg-accent text-white border-accent' : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="text-xs text-gray-500">
            The PDF is sent to Anthropic to write the drafts and is not stored. Nothing is added to your
            session until you accept it.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-btn text-white font-bold py-3.5 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Reading the chapter… this can take a minute' : 'Draft questions'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AiDraftModal;

/** Drafts waiting for the host. Each is reviewed in QuestionForm, or all accepted at once. */
export const DraftList: React.FC<{
  eventId: string;
  survey: boolean;
  drafts: any[];
  setDrafts: React.Dispatch<React.SetStateAction<any[]>>;
  onReview: (draft: any) => void;
  onAdded: () => void;
}> = ({ eventId, survey, drafts, setDrafts, onReview, onAdded }) => {
  const [busy, setBusy] = useState(false);

  const acceptAll = async () => {
    setBusy(true);
    try {
      // One at a time, so a plan limit stops the run with the rest still in review.
      for (const draft of drafts) {
        await api.post('/questions', {
          ...draft,
          eventId,
          // Surveys never store an answer key, as in QuestionForm.
          ...(survey ? { correctOption: null, correctOptions: [] } : {}),
        });
        setDrafts((d) => d.filter((x) => x.draftKey !== draft.draftKey));
      }
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Could not add every draft.');
    } finally {
      setBusy(false);
      onAdded();
    }
  };

  return (
    <section className="mb-8 rounded-3xl border border-accent-soft bg-accent-wash p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-bold text-gray-900">{drafts.length} drafts to review</h3>
          <p className="text-xs text-gray-600">Check each answer key — a draft is a starting point, not a finished question.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDrafts([])} disabled={busy} className="px-4 py-2 rounded-2xl text-sm font-semibold bg-white border border-gray-200 text-gray-600">
            Discard
          </button>
          <button onClick={acceptAll} disabled={busy} className="px-4 py-2 rounded-2xl text-sm font-semibold gradient-btn text-white disabled:opacity-50">
            {busy ? 'Adding…' : 'Add all'}
          </button>
        </div>
      </div>
      <ol className="space-y-2">
        {drafts.map((d) => (
          <li key={d.draftKey}>
            <button
              onClick={() => onReview(d)}
              className="w-full text-left bg-white rounded-2xl border border-gray-200 px-4 py-3 hover:border-accent"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent mr-2">{d.type}</span>
              <span className="text-gray-900">{d.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
