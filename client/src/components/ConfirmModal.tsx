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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl relative z-10 border border-gray-200 hover-card"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-sm ${
                  isDestructive ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                }`}
              >
                {icon ? icon : <AlertTriangle className="w-7 h-7" />}
              </div>

              <h3 className="font-heading text-2xl font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 mb-8 font-medium">{message}</p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3.5 px-4 rounded-xl font-semibold text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors shadow-sm"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onCancel(); // Auto close on confirm
                  }}
                  className={`flex-1 py-3.5 px-4 rounded-xl font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 ${
                    isDestructive
                      ? 'bg-red-500 hover:bg-red-600 border border-red-600'
                      : 'gradient-btn hover:shadow-md'
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
