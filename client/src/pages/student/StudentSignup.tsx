import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check } from 'lucide-react';
import api from '../../services/api';
import Logo from '../../components/Logo';
import { useAuth } from '../../context/AuthContext';
import { Morph, Rise } from 'cube-motion/react';
import { field, label, press } from '../../components/classroom/style';

/**
 * Student signup. The account belongs to no class until the student joins
 * one; arriving from a class link (`?code=`) joins that class right after.
 */
const StudentSignup: React.FC = () => {
  const [params] = useSearchParams();
  const code = params.get('code');
  const navigate = useNavigate();
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const longEnough = password.length >= 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!longEnough) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/student-signup', { name: name.trim(), email: email.trim(), password });

      // Join before signing in: signing in re-renders this public-only route
      // straight to the dashboard, which would load before the join landed.
      if (code) {
        try {
          const joined = await api.post(
            '/student/classrooms/join',
            { code },
            { headers: { Authorization: `Bearer ${res.data.token}` } }
          );
          toast.success(`You joined ${joined.data.classroom.name}`);
        } catch (joinError: any) {
          toast.error(joinError.response?.data?.message || 'Account created, but that class code did not work.');
        }
      }

      login(res.data.user, res.data.token);
      navigate('/student', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 font-sans">
        <Rise
          as="form"
          onSubmit={submit}
          targets="children"
          className="max-w-md w-full bg-white rounded-3xl p-7 sm:p-10 shadow-sm border border-gray-200 space-y-5"
        >
          <div className="text-center">
            <Logo size={44} className="mx-auto" />
            <h1 className="mt-4 text-[1.625rem] leading-tight tracking-[-0.02em] font-bold text-gray-900">
              Create your student account
            </h1>
            <p className="mt-2 text-[15px] text-gray-500">
              {code ? (
                <>
                  You will join the class{' '}
                  <span className="font-mono font-semibold tracking-[0.15em] text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">
                    {code.toUpperCase()}
                  </span>
                </>
              ) : (
                'Join your classes with a code once you are in.'
              )}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <label className="block">
            <span className={label}>Full name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} autoComplete="name" />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" />
          </label>
          <label className="block">
            <span className={label}>Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className={field}
              autoComplete="new-password"
              aria-describedby="password-hint"
            />
            <span
              id="password-hint"
              className={`mt-1.5 flex items-center gap-1 text-xs transition-colors ${longEnough ? 'text-emerald-700' : 'text-gray-500'}`}
            >
              {longEnough && <Check className="w-3.5 h-3.5" />}
              At least 8 characters
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className={`${press} w-full py-3.5 rounded-2xl gradient-btn text-white font-semibold text-[15px] disabled:opacity-50`}
          >
            <Morph active={loading} off={code ? 'Create account and join' : 'Create account'} on="Creating account…" />
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              to={code ? `/login?next=${encodeURIComponent(`/join-class/${code}`)}` : '/login'}
              className="font-semibold text-accent hover:underline"
            >
              Sign in
            </Link>
          </p>
        </Rise>
      </div>
    </>
  );
};

export default StudentSignup;
