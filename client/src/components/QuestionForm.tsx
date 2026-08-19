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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-xl border border-gray-200 relative my-8"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-5 mb-6 border-b border-gray-200">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600">
              Question Builder
            </span>
            <h2 className="font-heading text-3xl font-bold text-gray-900">
              {initialData ? 'Edit Question' : 'Craft New Question'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-full transition-all border border-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question Text */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Question Title
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="E.g., What is the capital of France?"
                className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 text-base placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all shadow-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Answer Options
              </label>
              <span className="text-xs text-indigo-600 italic font-medium">
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
                        ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm hover:shadow'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setCorrectOption(isSelected ? null : idx)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'border-2 border-gray-300 hover:border-indigo-400 text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      required
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 bg-transparent px-2 py-1 outline-none text-gray-900 font-medium placeholder:text-gray-400"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                    />
                    {isSelected && (
                      <span className="text-xs font-bold tracking-wide uppercase px-3 py-1 rounded-full bg-indigo-100 text-indigo-700">
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
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Time Limit</span>
            </label>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all shadow-sm"
            >
              <option value={0}>No timer — Manual host advance</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds (Recommended)</option>
              <option value={60}>60 seconds (1 minute)</option>
              <option value={120}>120 seconds (2 minutes)</option>
            </select>
          </div>

          {/* Submit Action */}
          <div className="pt-4 flex gap-4 border-t border-gray-200 mt-6 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3.5 rounded-2xl transition-all shadow-sm border border-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 gradient-btn text-white font-bold py-3.5 rounded-2xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50"
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
