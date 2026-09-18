import React, { useState, useEffect } from 'react';
import { Check, Clock, Plus, Minus, Trophy, ImagePlus } from 'lucide-react';
import { uploadImage, imageSrc } from '../utils/uploadImage';
import Sheet from './Sheet';
import toast from 'react-hot-toast';

const TYPES = [
  { id: 'MCQ', label: 'Multiple choice' },
  { id: 'MULTI_SELECT', label: 'Multi-select' },
  { id: 'OPEN_TEXT', label: 'Open text' },
  { id: 'WORD_CLOUD', label: 'Word cloud' },
  { id: 'RATING', label: 'Rating' },
  { id: 'RANKING', label: 'Ranking' },
] as const;

interface QuestionFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
  /** When true, hide answer-key UI — this session is a survey. */
  surveyMode?: boolean;
}

const QuestionForm: React.FC<QuestionFormProps> = ({ open, onClose, onSubmit, initialData, surveyMode = false }) => {
  const [type, setType] = useState<string>('MCQ');
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState<number | null>(null);
  const [correctOptions, setCorrectOptions] = useState<number[]>([]);
  const [timeLimit, setTimeLimit] = useState<number>(30);
  const [scored, setScored] = useState<'INHERIT' | 'YES' | 'NO'>('INHERIT');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const needsOptions = type === 'MCQ' || type === 'MULTI_SELECT' || type === 'RATING' || type === 'RANKING';

  // The sheet stays mounted so it can animate away; each opening starts from
  // the question being edited, or from a blank one.
  useEffect(() => {
    if (!open) return;
    setType(initialData?.type || 'MCQ');
    setText(initialData?.text || '');
    setOptions(initialData?.options?.length ? initialData.options : ['', '', '', '']);
    setCorrectOption(initialData?.correctOption ?? null);
    setCorrectOptions(initialData?.correctOptions || []);
    setTimeLimit(initialData ? initialData.timeLimit || 0 : 30);
    setScored(initialData?.scored === 'YES' || initialData?.scored === 'NO' ? initialData.scored : 'INHERIT');
    setImageUrl(initialData?.imageUrl || null);
  }, [open, initialData]);

  const handleOptionChange = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadImage(file, 'question'));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error('Please fill in the question title.');
      return;
    }

    const filled = options.map((opt) => opt.trim()).filter(Boolean);
    if (needsOptions && filled.length < 2) {
      toast.error('Add at least two options.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        type,
        text,
        options: needsOptions
          ? type === 'RATING' && filled.length < 2
            ? ['1', '2', '3', '4', '5']
            : options.map((o) => o.trim()).filter(Boolean)
          : [],
        // Surveys never store an answer key. Quizzes keep the host's marks.
        correctOption:
          surveyMode || type === 'MULTI_SELECT' || type === 'RANKING' ? null : correctOption,
        correctOptions: surveyMode
          ? []
          : type === 'MULTI_SELECT'
            ? correctOptions
            : type === 'RANKING'
              ? correctOptions.length
                ? correctOptions
                : []
              : correctOption !== null
                ? [correctOption]
                : [],
        timeLimit,
        scored,
        imageUrl,
      });
      onClose();
    } catch (error) {
      console.error('Submit error:', error);
      // The server explains plan limits and validation failures in its own
      // words — "Your FREE plan allows 20 questions per session" is actionable,
      // "Failed to save question" reads like the app is broken.
      const message = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(message || 'Could not save that question.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="Question"
      title={initialData?.id ? 'Edit question' : initialData ? 'Review draft' : 'New question'}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-full bg-gray-100 text-ink font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            form="question-form"
            disabled={loading || uploading}
            className="flex-1 h-12 rounded-full btn-primary disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
        <form id="question-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  type === item.id ? 'bg-accent text-white border-accent' : 'bg-gray-100 text-ink-soft border-transparent'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="question-title" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Question Title
            </label>
            <input id="question-title"
              type="text"
              required
              placeholder="E.g., What is the capital of France?"
              className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 text-base outline-none focus:border-accent"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div>
            {imageUrl ? (
              <div className="flex items-start gap-3">
                <img src={imageSrc(imageUrl)} alt="" className="max-h-40 max-w-full object-contain rounded-2xl border border-gray-200" />
                <button type="button" onClick={() => setImageUrl(null)} className="text-xs font-semibold text-gray-500">
                  Remove image
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent cursor-pointer">
                <ImagePlus className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Add an image (PNG, JPEG or WebP)'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    void handleImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {needsOptions && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                  {type === 'RATING' ? 'Scale labels' : type === 'RANKING' ? 'Items to rank' : 'Answer Options'}
                </span>
                {!surveyMode && type !== 'RATING' && type !== 'RANKING' && (
                  <span className="text-xs text-accent italic font-medium">
                    {type === 'MULTI_SELECT' ? 'Tap to mark every correct answer' : 'Tap to mark the correct answer'}
                  </span>
                )}
                {!surveyMode && type === 'RANKING' && (
                  <span className="text-xs text-accent italic font-medium">
                    Optional: tap items in the correct order to set an answer key
                  </span>
                )}
                {surveyMode && (
                  <span className="text-xs text-teal-700 italic font-medium">
                    Survey mode — no correct answer
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {options.map((opt, idx) => {
                  const isSelected =
                    !surveyMode &&
                    (type === 'MULTI_SELECT' || type === 'RANKING'
                      ? correctOptions.includes(idx)
                      : correctOption === idx);
                  const rankPosition =
                    !surveyMode && type === 'RANKING' && correctOptions.includes(idx)
                      ? correctOptions.indexOf(idx) + 1
                      : null;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${
                        isSelected ? 'border-accent-soft bg-accent-wash' : 'border-gray-200 bg-white'
                      }`}
                    >
                      {!surveyMode && type !== 'RATING' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (type === 'MULTI_SELECT') {
                              setCorrectOptions((prev) =>
                                prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                              );
                            } else if (type === 'RANKING') {
                              setCorrectOptions((prev) =>
                                prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                              );
                            } else {
                              setCorrectOption(isSelected ? null : idx);
                            }
                          }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isSelected ? 'bg-accent text-white' : 'border-2 border-gray-300'
                          }`}
                        >
                          {rankPosition ?? <Check className="w-4 h-4" />}
                        </button>
                      )}
                      <input
                        type="text"
                        placeholder={type === 'RANKING' ? `Item ${idx + 1}` : `Option ${idx + 1}`}
                        className="flex-1 bg-transparent px-2 py-1 outline-none text-gray-900 font-medium"
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => setOptions([...options, ''])} className="text-xs font-semibold text-accent flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add option
                </button>
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions(options.slice(0, -1))} className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5" /> Remove last
                  </button>
                )}
              </div>
            </div>
          )}

          {(type === 'OPEN_TEXT' || type === 'WORD_CLOUD') && (
            <p className="text-sm text-gray-500">
              Participants will type a short answer. {type === 'WORD_CLOUD' ? 'Words are grouped on the results screen.' : 'Answers show in the participant report.'}
            </p>
          )}

          {type === 'RANKING' && (
            <p className="text-sm text-gray-500">
              Participants drag items into their preferred order.
              {!surveyMode && ' If you set an answer key above, exact order match scores a point.'}
            </p>
          )}

          <div>
            <label htmlFor="question-time-limit" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span>Time Limit</span>
            </label>
            <select id="question-time-limit"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 font-medium outline-none"
            >
              <option value={0}>No timer — Manual host advance</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds (Recommended)</option>
              <option value={60}>60 seconds (1 minute)</option>
              <option value={120}>120 seconds (2 minutes)</option>
            </select>
          </div>

          {/* Per-question override — how one session holds unscored opinion
              polls next to scored quiz questions. */}
          <div>
            <label htmlFor="question-scoring" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              <Trophy className="w-3.5 h-3.5 text-accent" />
              <span>Scoring for this question</span>
            </label>
            <select id="question-scoring"
              value={scored}
              onChange={(e) => setScored(e.target.value as 'INHERIT' | 'YES' | 'NO')}
              className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 font-medium outline-none"
            >
              <option value="INHERIT">Follow the session setting</option>
              <option value="YES">Always score this one</option>
              <option value="NO">Never score this one</option>
            </select>
            <p className="text-xs text-gray-500 mt-1.5">
              Use this to drop an ungraded opinion poll into a quiz, or one graded
              question into a discussion.
            </p>
          </div>

        </form>
    </Sheet>
  );
};

export default QuestionForm;
