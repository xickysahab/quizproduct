import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import api from '../../services/api';
import Logo from '../../components/Logo';
import { useAuth } from '../../context/AuthContext';
import { Motion } from '../../components/classroom/ui';
import { press } from '../../components/classroom/style';

/**
 * The class join link a teacher shares: /join-class/K7M2QX.
 *
 * Joining waits for a click rather than firing on page load, so a link opened
 * by a preview bot or by accident never adds anyone to a class.
 */
const JoinClass: React.FC = () => {
  const { code = '' } = useParams();
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  if (isLoading) return null;

  const join = async () => {
    setJoining(true);
    try {
      const res = await api.post('/student/classrooms/join', { code });
      toast.success(
        res.data.alreadyMember ? `You are already in ${res.data.classroom.name}` : `You joined ${res.data.classroom.name}`
      );
      navigate('/student', { replace: true });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not join that class.');
      setJoining(false);
    }
  };

  const next = encodeURIComponent(`/join-class/${code}`);

  return (
    <Motion>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 text-center shadow-sm border border-gray-200 space-y-6"
        >
          <Logo size={40} className="mx-auto" />
          <div>
            <div className="w-16 h-16 rounded-2xl bg-accent-wash text-accent flex items-center justify-center mx-auto">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h1 className="mt-5 text-[1.625rem] leading-tight tracking-[-0.02em] font-bold text-gray-900">
              You are invited to a class
            </h1>
            <p className="mt-3 font-mono text-3xl font-bold tracking-[0.2em] text-gray-900">{code.toUpperCase()}</p>
          </div>

          {isAuthenticated && user?.role !== 'STUDENT' ? (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed">
              You are signed in as {user?.name}, a staff account. Class links are for students: send this link to your
              students, or sign out and open it again.
            </p>
          ) : isAuthenticated ? (
            <button
              onClick={join}
              disabled={joining}
              className={`${press} w-full py-3.5 rounded-2xl gradient-btn text-white font-semibold text-[15px] disabled:opacity-50`}
            >
              {joining ? 'Joining…' : `Join as ${user?.name}`}
            </button>
          ) : (
            <div className="space-y-3">
              <Link
                to={`/student/signup?code=${encodeURIComponent(code)}`}
                className={`${press} block w-full py-3.5 rounded-2xl gradient-btn text-white font-semibold text-[15px]`}
              >
                Create a student account
              </Link>
              <Link
                to={`/login?next=${next}`}
                className={`${press} block w-full py-3.5 rounded-2xl text-[15px] font-semibold text-accent bg-accent-wash`}
              >
                I already have an account
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </Motion>
  );
};

export default JoinClass;
