import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Logo from '../components/Logo';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('failed');
      setMessage('This link is missing its confirmation code.');
      return;
    }

    api
      .post('/auth/verify-email', { token })
      .then((res) => {
        setState('done');
        setMessage(res.data.message || 'Email confirmed.');
      })
      .catch((err) => {
        setState('failed');
        setMessage(err.response?.data?.message || 'This confirmation link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-200 space-y-5">
        <Logo size={44} className="mx-auto" />

        {state === 'working' && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-sm text-gray-500">Confirming your address…</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-gray-900">You&apos;re all set</h1>
            <p className="text-sm text-gray-500">{message}</p>
            <Link
              to="/login"
              className="inline-block w-full py-3.5 rounded-2xl gradient-btn text-white font-medium text-sm"
            >
              Sign in
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-gray-900">Link didn&apos;t work</h1>
            <p className="text-sm text-gray-500">{message}</p>
            <Link to="/signup" className="inline-block text-sm font-semibold text-indigo-600">
              Sign up again
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
