import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Mail, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface CreateAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateAdminModal: React.FC<CreateAdminModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // Create new admin using the protected /register endpoint
      await api.post('/auth/register', { name, email, password });
      toast.success('New Admin Created successfully!');
      
      // Reset and close
      setName('');
      setEmail('');
      setPassword('');
      onClose();
    } catch (error: any) {
      console.error('Create admin error:', error);
      toast.error(error.response?.data?.message || 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-[#111827] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative z-10 border border-[#8B5CF6]/15"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 flex items-center justify-center text-[#8B5CF6]">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h2 className="font-heading text-2xl font-bold text-white">Add Admin</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-[#64748B] hover:bg-[#1E293B] rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                  Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#64748B] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-[#1E293B] bg-[#0B0F1A] text-white text-sm focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all placeholder:text-[#475569]"
                    placeholder="Admin Name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748B] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-[#1E293B] bg-[#0B0F1A] text-white text-sm focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all placeholder:text-[#475569]"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748B] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-[#1E293B] bg-[#0B0F1A] text-white text-sm focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all placeholder:text-[#475569]"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 gradient-btn text-white font-semibold py-3 rounded-xl transition-all shadow-glow-sm hover:shadow-glow-md disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Admin'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CreateAdminModal;
