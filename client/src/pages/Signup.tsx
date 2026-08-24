import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Logo from '../components/Logo';
import { ArrowRight, Mail, Lock, User, Building2, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Self-serve signup.
 *
 * Until now the only route to an account was an invite from an existing admin,
 * which rules out product-led growth entirely. A signup creates a TENANT with
 * its own organisation.
 */
const Signup: React.FC = () => {
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/signup', {
        name: name.trim(),
        organizationName: organizationName.trim(),
        email: email.trim(),
        password,
      });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not create the account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans relative selection:bg-accent-wash">
      <Navbar />

      <main className="flex-1 pt-32 pb-24 px-6 md:px-12 flex items-center justify-center relative bg-ambient-glow">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full bg-white rounded-3xl p-8 md:p-10 shadow-xl border border-gray-100 relative hover-card z-10"
        >
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="font-heading text-2xl font-bold text-gray-900">Check your email</h2>
              <p className="text-sm text-gray-500">
                We sent a confirmation link to <strong className="text-gray-900">{email}</strong>.
                Open it to finish setting up your workspace.
              </p>
              <Link
                to="/login"
                className="inline-block text-sm font-semibold text-accent hover:text-accent pt-2"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <Logo size={48} className="mx-auto mb-4" />
                <span className="text-[11px] font-bold tracking-[0.2em] text-accent uppercase">
                  Create your workspace
                </span>
                <h2 className="font-heading text-3xl font-bold text-gray-900 mt-1">Get started</h2>
                <p className="text-sm text-gray-500 mt-1">Free to try. No card needed.</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium text-center mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                <Field icon={<User className="w-4 h-4" />} label="Your name">
                  <input
                    type="text" required value={name} maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aagam Jain"
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </Field>

                <Field icon={<Building2 className="w-4 h-4" />} label="Organisation">
                  <input
                    type="text" value={organizationName} maxLength={80}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder="Optional — defaults to your name"
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </Field>

                <Field icon={<Mail className="w-4 h-4" />} label="Work email">
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </Field>

                <Field icon={<Lock className="w-4 h-4" />} label="Password">
                  <input
                    type="password" required value={password} minLength={8}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </Field>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full gradient-btn text-white text-base font-semibold py-3.5 rounded-2xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 group mt-2"
                >
                  <span>{loading ? 'Creating…' : 'Create workspace'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-accent hover:text-accent">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

const Field: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({
  icon, label, children,
}) => (
  <label className="block">
    <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
      {label}
    </span>
    <span className="flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-gray-200 bg-gray-50 focus-within:bg-white focus-within:border-accent focus-within:ring-4 focus-within:ring-accent transition-all">
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      {children}
    </span>
  </label>
);

export default Signup;
