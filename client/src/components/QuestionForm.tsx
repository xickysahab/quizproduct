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
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-[#FFFFFF] rounded-3xl max-w-2xl w-full p-8 shadow-lux-lg border border-[#E0F2FE] relative my-8"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-5 mb-6 border-b border-[#E0F2FE]">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#06B6D4]">
              Question Builder
            </span>
            <h2 className="font-serif text-3xl font-bold text-[#0F172A]">
              {initialData ? 'Edit Question' : 'Craft New Question'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-[#F0F9FF] hover:bg-[#E0F2FE] text-[#475569] hover:text-[#0F172A] rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question Text */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-2">
              Question Title
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="E.g., What is the capital of France?"
                className="w-full px-5 py-3.5 rounded-2xl border border-[#E0F2FE] bg-[#FFFFFF] text-[#0F172A] text-base placeholder:text-[#94A3B8] focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4] outline-none transition-all shadow-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Answer Options
              </label>
              <span className="text-xs text-[#06B6D4] italic">
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
                        ? 'border-[#06B6D4] bg-[#ECFEFF] shadow-sm'
                        : 'border-[#E0F2FE] bg-[#FFFFFF] hover:border-[#D8CCC0]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setCorrectOption(isSelected ? null : idx)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-[#06B6D4] text-white shadow-sm'
                          : 'border-2 border-[#D8CCC0] hover:border-[#06B6D4] text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      required
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 bg-transparent px-2 py-1 outline-none text-[#0F172A] font-medium placeholder:text-[#94A3B8]"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                    />
                    {isSelected && (
                      <span className="text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full bg-[#06B6D4]/10 text-[#06B6D4]">
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
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#475569] mb-2">
              <Clock className="w-3.5 h-3.5 text-[#06B6D4]" />
              <span>Time Limit</span>
            </label>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full px-5 py-3.5 rounded-2xl border border-[#E0F2FE] bg-[#FFFFFF] text-[#0F172A] font-medium outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4] transition-all shadow-sm"
            >
              <option value={0}>No timer — Manual host advance</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds (Recommended)</option>
              <option value={60}>60 seconds (1 minute)</option>
              <option value={120}>120 seconds (2 minutes)</option>
            </select>
          </div>

          {/* Submit Action */}
          <div className="pt-4 flex gap-4 border-t border-[#E0F2FE]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#F0F9FF] hover:bg-[#E0F2FE] text-[#334155] font-medium py-3.5 rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-[#FFFFFF] font-medium py-3.5 rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50"
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
