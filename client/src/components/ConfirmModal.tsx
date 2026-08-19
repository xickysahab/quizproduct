import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon,
  onConfirm,
  onCancel,
  isDestructive = false,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-[#111827] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative z-10 border border-[#8B5CF6]/15"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-2 text-[#64748B] hover:bg-[#1E293B] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-sm ${
                  isDestructive ? 'bg-[#F43F5E]/15 text-[#F43F5E]' : 'bg-[#8B5CF6]/15 text-[#8B5CF6]'
                }`}
              >
                {icon ? icon : <AlertTriangle className="w-7 h-7" />}
              </div>

              <h3 className="font-heading text-2xl font-bold text-white mb-2">{title}</h3>
              <p className="text-[#94A3B8] mb-8 font-medium">{message}</p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3.5 px-4 rounded-xl font-semibold text-[#94A3B8] bg-[#1E293B] hover:bg-[#334155] transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onCancel(); // Auto close on confirm
                  }}
                  className={`flex-1 py-3.5 px-4 rounded-xl font-semibold text-white shadow-md transition-colors ${
                    isDestructive
                      ? 'gradient-btn-coral hover:opacity-90'
                      : 'gradient-btn hover:opacity-90'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
