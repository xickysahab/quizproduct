import React, { useState, useEffect } from 'react';
import { X, Check, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

interface QuestionFormProps {
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
}

const QuestionForm: React.FC<QuestionFormProps> = ({ onClose, onSubmit, initialData }) => {
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState<number | null>(null);
  const [timeLimit, setTimeLimit] = useState<number>(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData) {
      setText(initialData.text);
      setOptions(initialData.options.length ? initialData.options : ['', '', '', '']);
      setCorrectOption(initialData.correctOption !== undefined ? initialData.correctOption : null);
      setTimeLimit(initialData.timeLimit || 0);
    }
  }, [initialData]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || options.some((opt) => !opt.trim())) {
      toast.error('Please fill in the question title and all four options.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({ text, options, correctOption, timeLimit });
      onClose();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to save question.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-[#111827] rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-[#8B5CF6]/15 relative my-8"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-5 mb-6 border-b border-[#1E293B]">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
              Question Builder
            </span>
            <h2 className="font-heading text-3xl font-bold text-white">
              {initialData ? 'Edit Question' : 'Craft New Question'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] hover:text-white rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question Text */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-2">
              Question Title
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="E.g., What is the capital of France?"
                className="w-full px-5 py-3.5 rounded-2xl border border-[#1E293B] bg-[#0B0F1A] text-white text-base placeholder:text-[#475569] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                Answer Options
              </label>
              <span className="text-xs text-[#8B5CF6] italic">
                Tap radio icon to mark the correct answer
              </span>
            </div>

            <div className="space-y-3">
              {options.map((opt, idx) => {
                const isSelected = correctOption === idx;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? 'border-[#8B5CF6]/40 bg-[#8B5CF6]/10 shadow-glow-sm'
                        : 'border-[#1E293B] bg-[#0B0F1A] hover:border-[#334155]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setCorrectOption(isSelected ? null : idx)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-[#8B5CF6] text-white shadow-sm'
                          : 'border-2 border-[#334155] hover:border-[#8B5CF6] text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      required
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 bg-transparent px-2 py-1 outline-none text-white font-medium placeholder:text-[#475569]"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                    />
                    {isSelected && (
                      <span className="text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full bg-[#8B5CF6]/15 text-[#A78BFA]">
                        Correct Answer
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-2">
              <Clock className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <span>Time Limit</span>
            </label>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full px-5 py-3.5 rounded-2xl border border-[#1E293B] bg-[#0B0F1A] text-white font-medium outline-none focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 transition-all"
            >
              <option value={0}>No timer — Manual host advance</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds (Recommended)</option>
              <option value={60}>60 seconds (1 minute)</option>
              <option value={120}>120 seconds (2 minutes)</option>
            </select>
          </div>

          {/* Submit Action */}
          <div className="pt-4 flex gap-4 border-t border-[#1E293B]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] font-medium py-3.5 rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 gradient-btn text-white font-medium py-3.5 rounded-2xl transition-all shadow-glow-sm hover:shadow-glow-md disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default QuestionForm;
