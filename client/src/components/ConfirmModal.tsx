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
            className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative z-10 border border-[#E0F2FE]"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-2 text-[#64748B] hover:bg-[#F1F5F9] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-sm ${
                  isDestructive ? 'bg-[#FEF2F2] text-[#EF4444]' : 'bg-[#E0F2FE] text-[#06B6D4]'
                }`}
              >
                {icon ? icon : <AlertTriangle className="w-7 h-7" />}
              </div>

              <h3 className="font-serif text-2xl font-bold text-[#0F172A] mb-2">{title}</h3>
              <p className="text-[#475569] mb-8 font-medium">{message}</p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3.5 px-4 rounded-xl font-semibold text-[#475569] bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors"
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
                      ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                      : 'bg-[#F97316] hover:bg-[#EA580C]'
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
