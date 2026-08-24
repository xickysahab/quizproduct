import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const AcceptInvite: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/accept-invite', { token, name, password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invite could not be accepted.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">Accept invite</h1>
          {done ? (
            <p className="text-sm text-gray-600">
              Account created.{' '}
              <Link to="/login" className="text-accent font-semibold">
                Sign in
              </Link>
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none"
                placeholder="Your name"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none"
                placeholder="Choose a password (min. 8)"
              />
              <button type="submit" disabled={loading || !token} className="w-full gradient-btn text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                {loading ? 'Creating...' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AcceptInvite;
