import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

/**
 * An alert: small, centred, and settling in from slightly larger, the way a
 * system alert does. Kept for decisions that cannot be undone — used for
 * everything, it trains people to click through it. Focus starts on Cancel,
 * so a stray Enter never deletes anything.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
}) => {
  const cancel = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!isOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancelRef.current();
    document.addEventListener('keydown', esc);
    const t = setTimeout(() => cancel.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', esc);
      clearTimeout(t);
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 scrim"
            onClick={onCancel}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative w-full max-w-[320px] material-sheet rounded-[18px] overflow-hidden text-center"
          >
            <div className="px-5 pt-5 pb-4">
              <h3 id="confirm-title" className="text-[17px] font-semibold text-ink">
                {title}
              </h3>
              <p id="confirm-message" className="text-[13px] text-ink-soft mt-1.5 leading-snug">
                {message}
              </p>
            </div>
            <div className="grid grid-cols-2 border-t border-line">
              <button
                ref={cancel}
                onClick={onCancel}
                className="py-3 text-[17px] text-accent hover:bg-gray-100/60 border-r border-line"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onCancel();
                }}
                className={`py-3 text-[17px] font-semibold hover:bg-gray-100/60 ${isDestructive ? 'text-red-600' : 'text-accent'}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
