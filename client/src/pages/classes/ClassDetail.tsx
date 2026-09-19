import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Copy, Link2, RefreshCw, Trash2, UserMinus, Users } from 'lucide-react';
import api from '../../services/api';
import DashboardLayout from '../../components/DashboardLayout';
import ConfirmModal from '../../components/ConfirmModal';
import { sidebarForRole, dashboardTitleForRole } from '../../config/sidebar';
import { useAuth } from '../../context/AuthContext';
import { CopyButton, Motion } from '../../components/classroom/ui';
import { initials, press, rise } from '../../components/classroom/style';
import type { ClassroomSummary } from './Classes';

interface Student {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

type Pending = { kind: 'remove'; student: Student } | { kind: 'reset' } | { kind: 'delete' } | null;

const ClassDetail: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classroom, setClassroom] = useState<ClassroomSummary | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    api
      .get(`/classrooms/${id}`)
      .then((res) => {
        setClassroom(res.data.classroom);
        setStudents(res.data.students);
      })
      .catch(() => setMissing(true));
  }, [id]);

  const joinLink = classroom ? `${window.location.origin}/join-class/${classroom.joinCode}` : '';

  const confirm = async () => {
    const action = pending;
    setPending(null);
    if (!action || !classroom) return;

    try {
      if (action.kind === 'remove') {
        await api.delete(`/classrooms/${classroom.id}/members/${action.student.id}`);
        setStudents((prev) => prev.filter((s) => s.id !== action.student.id));
        toast.success(`${action.student.name} removed`);
      } else if (action.kind === 'reset') {
        const res = await api.post(`/classrooms/${classroom.id}/reset-code`);
        setClassroom({ ...classroom, joinCode: res.data.joinCode });
        toast.success('New code ready. The old one no longer works.');
      } else {
        await api.delete(`/classrooms/${classroom.id}`);
        toast.success('Class deleted');
        navigate('/classes');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'That did not work. Try again.');
    }
  };

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <Motion>
        <div className="max-w-4xl space-y-6">
          <Link to="/classes" className="inline-flex items-center gap-0.5 -ml-1 text-sm font-medium text-accent hover:underline">
            <ChevronLeft className="w-4 h-4" /> Classes
          </Link>

          {missing ? (
            <p className="text-gray-500">This class does not exist, or you do not have access to it.</p>
          ) : !classroom ? (
            <div className="space-y-4" aria-busy="true">
              <div className="h-9 w-64 rounded-lg bg-gray-100 motion-safe:animate-pulse" />
              <div className="h-40 rounded-2xl bg-white border border-gray-200" />
            </div>
          ) : (
            <>
              <motion.header {...rise}>
                <h1 className="text-[2rem] leading-[1.1] tracking-[-0.02em] font-bold text-gray-900">{classroom.name}</h1>
                {classroom.section && <p className="text-[15px] text-gray-500 mt-1.5">{classroom.section}</p>}
              </motion.header>

              {/* The code is the one thing a teacher comes here to read out, so it is the largest thing on the page. */}
              <motion.section {...rise} className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Class code</p>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={classroom.joinCode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-2 font-mono text-5xl sm:text-6xl font-bold tracking-[0.18em] text-gray-900 select-all"
                  >
                    {classroom.joinCode}
                  </motion.p>
                </AnimatePresence>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <CopyButton text={classroom.joinCode} icon={Copy}>Copy code</CopyButton>
                  <CopyButton text={joinLink} icon={Link2}>Copy join link</CopyButton>
                  <button
                    onClick={() => setPending({ kind: 'reset' })}
                    className={`${press} inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100`}
                  >
                    <RefreshCw className="w-4 h-4" /> Reset code
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-4 leading-relaxed">
                  Students create a free student account, then type this code or open the join link.
                </p>
              </motion.section>

              <motion.section {...rise} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 flex items-center gap-2 border-b border-gray-100">
                  <Users className="w-4 h-4 text-gray-400" />
                  <h2 className="font-semibold text-gray-900">Students</h2>
                  <span className="ml-1 text-sm text-gray-400 tabular-nums">{students.length}</span>
                </div>

                {students.length === 0 ? (
                  <p className="px-6 py-12 text-center text-gray-400 text-sm">
                    No students yet. Share the code or the join link above.
                  </p>
                ) : (
                  <ul>
                    <AnimatePresence initial={false}>
                      {students.map((s) => (
                        <motion.li
                          key={s.id}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden border-t border-gray-100 first:border-t-0"
                        >
                          <div className="px-6 py-3.5 flex items-center gap-4">
                            <span
                              aria-hidden="true"
                              className="w-9 h-9 shrink-0 rounded-full bg-accent-wash text-accent text-[13px] font-semibold flex items-center justify-center"
                            >
                              {initials(s.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 truncate">{s.name}</p>
                              <p className="text-sm text-gray-500 truncate">{s.email}</p>
                            </div>
                            <span className="hidden sm:block text-xs text-gray-400 whitespace-nowrap">
                              Joined {format(new Date(s.joinedAt), 'd MMM yyyy')}
                            </span>
                            <button
                              onClick={() => setPending({ kind: 'remove', student: s })}
                              className={`${press} p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50`}
                              aria-label={`Remove ${s.name}`}
                              title="Remove from class"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </motion.section>

              {/* Destructive, rare, and irreversible: last on the page, never next to the everyday actions. */}
              <section className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Delete this class</p>
                  <p className="text-sm text-gray-500">Removes every student from it. This cannot be undone.</p>
                </div>
                <button
                  onClick={() => setPending({ kind: 'delete' })}
                  className={`${press} self-start inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50`}
                >
                  <Trash2 className="w-4 h-4" /> Delete class
                </button>
              </section>
            </>
          )}
        </div>
      </Motion>

      <ConfirmModal
        isOpen={pending !== null}
        isDestructive={pending?.kind !== 'reset'}
        title={
          pending?.kind === 'remove'
            ? `Remove ${pending.student.name}?`
            : pending?.kind === 'reset'
              ? 'Reset the class code?'
              : 'Delete this class?'
        }
        message={
          pending?.kind === 'remove'
            ? 'They leave the class now. Their past answers stay in your reports. They can rejoin with the current code unless you reset it.'
            : pending?.kind === 'reset'
              ? 'The current code and join link stop working. Students already in the class stay in.'
              : 'Every student is removed from it. This cannot be undone.'
        }
        confirmText={pending?.kind === 'remove' ? 'Remove' : pending?.kind === 'reset' ? 'Reset code' : 'Delete class'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </DashboardLayout>
  );
};

export default ClassDetail;
