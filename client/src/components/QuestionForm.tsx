import React, { useState, useEffect } from 'react';
import { X, Check, Clock, Plus, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const TYPES = [
  { id: 'MCQ', label: 'Multiple choice' },
  { id: 'MULTI_SELECT', label: 'Multi-select' },
  { id: 'OPEN_TEXT', label: 'Open text' },
  { id: 'WORD_CLOUD', label: 'Word cloud' },
  { id: 'RATING', label: 'Rating' },
] as const;

interface QuestionFormProps {
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
}

const QuestionForm: React.FC<QuestionFormProps> = ({ onClose, onSubmit, initialData }) => {
  const [type, setType] = useState<string>('MCQ');
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState<number | null>(null);
  const [correctOptions, setCorrectOptions] = useState<number[]>([]);
  const [timeLimit, setTimeLimit] = useState<number>(30);
  const [loading, setLoading] = useState(false);

  const needsOptions = type === 'MCQ' || type === 'MULTI_SELECT' || type === 'RATING';

  useEffect(() => {
    if (initialData) {
      setType(initialData.type || 'MCQ');
      setText(initialData.text);
      setOptions(initialData.options?.length ? initialData.options : ['', '', '', '']);
      setCorrectOption(initialData.correctOption !== undefined ? initialData.correctOption : null);
      setCorrectOptions(initialData.correctOptions || []);
      setTimeLimit(initialData.timeLimit || 0);
    }
  }, [initialData]);

  const handleOptionChange = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
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
        options: needsOptions ? (type === 'RATING' && filled.length < 2 ? ['1', '2', '3', '4', '5'] : options.map((o) => o.trim()).filter(Boolean)) : [],
        correctOption: type === 'MULTI_SELECT' ? null : correctOption,
        correctOptions: type === 'MULTI_SELECT' ? correctOptions : correctOption !== null ? [correctOption] : [],
        timeLimit,
      });
      onClose();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to save question.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-xl border border-gray-200 relative my-8"
      >
        <div className="flex justify-between items-center pb-5 mb-6 border-b border-gray-200">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600">
              Question Builder
            </span>
            <h2 className="font-heading text-3xl font-bold text-gray-900">
              {initialData ? 'Edit Question' : 'Craft New Question'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-full border border-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  type === item.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Question Title
            </label>
            <input
              type="text"
              required
              placeholder="E.g., What is the capital of France?"
              className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 text-base outline-none focus:border-indigo-500"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {needsOptions && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                  {type === 'RATING' ? 'Scale labels' : 'Answer Options'}
                </label>
                {type !== 'RATING' && (
                  <span className="text-xs text-indigo-600 italic font-medium">
                    {type === 'MULTI_SELECT' ? 'Tap to mark every correct answer' : 'Tap to mark the correct answer'}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {options.map((opt, idx) => {
                  const isSelected = type === 'MULTI_SELECT' ? correctOptions.includes(idx) : correctOption === idx;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${
                        isSelected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      {type !== 'RATING' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (type === 'MULTI_SELECT') {
                              setCorrectOptions((prev) =>
                                prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                              );
                            } else {
                              setCorrectOption(isSelected ? null : idx);
                            }
                          }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center ${
                            isSelected ? 'bg-indigo-600 text-white' : 'border-2 border-gray-300'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <input
                        type="text"
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 bg-transparent px-2 py-1 outline-none text-gray-900 font-medium"
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => setOptions([...options, ''])} className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
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

          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Time Limit</span>
            </label>
            <select
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

          <div className="pt-4 flex gap-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 font-bold py-3.5 rounded-2xl">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 gradient-btn text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default QuestionForm;
