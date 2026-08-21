import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Mail } from 'lucide-react';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">Reset password</h1>
          {sent ? (
            <p className="text-sm text-gray-600">
              If that account exists, a reset link is on its way. Check your inbox (or the server logs in development).
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-500"
                  placeholder="you@company.com"
                />
              </div>
              <button type="submit" disabled={loading} className="w-full gradient-btn text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          )}
          <Link to="/login" className="text-sm text-indigo-600 font-semibold">
            Back to sign in
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ForgotPassword;
