import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, GraduationCap } from 'lucide-react';
import api from '../../services/api';
import DashboardLayout from '../../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../../config/sidebar';
import { useAuth } from '../../context/AuthContext';
import { Motion, SkeletonCards } from '../../components/classroom/ui';
import { Morph } from 'cube-motion/react';
import { initials, isClassCode, label, normalizeClassCode, press, rise, spring } from '../../components/classroom/style';

interface MyClass {
  id: string;
  name: string;
  section: string | null;
  teacherName: string;
  joinedAt: string;
}

const StudentHome: React.FC = () => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<MyClass[] | null>(null);
  const [raw, setRaw] = useState('');
  const [joining, setJoining] = useState(false);

  // Validate as they type: a pasted link or lower case is fine, a wrong length says so now.
  const code = normalizeClassCode(raw);
  const valid = isClassCode(code);
  const hint = !raw.trim()
    ? 'Six letters and numbers, from your teacher. A join link works too.'
    : valid
      ? 'Looks right.'
      : code.length < 6
        ? `${6 - code.length} more to go.`
        : 'Class codes are 6 letters and numbers, without 0, O, 1 or I.';

  const load = () =>
    api
      .get('/student/classrooms')
      .then((res) => setClasses(res.data.classrooms))
      .catch(() => {
        toast.error('Could not load your classes.');
        setClasses([]);
      });

  useEffect(() => {
    void load();
  }, []);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setJoining(true);
    try {
      const res = await api.post('/student/classrooms/join', { code });
      toast.success(
        res.data.alreadyMember ? `You are already in ${res.data.classroom.name}` : `You joined ${res.data.classroom.name}`
      );
      setRaw('');
      void load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not join that class.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <Motion>
        <div className="max-w-5xl space-y-8">
          <header>
            <h1 className="text-[2rem] leading-[1.1] tracking-[-0.02em] font-bold text-gray-900">My classes</h1>
            <p className="text-[15px] text-gray-500 mt-2">Hi {user?.name?.split(' ')[0]}. Join a class with the code your teacher gives you.</p>
          </header>

          <form onSubmit={join} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <label htmlFor="class-code" className={label}>Join a class</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  id="class-code"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="K7M2QX"
                  aria-describedby="class-code-hint"
                  aria-invalid={Boolean(raw.trim()) && !valid && code.length >= 6}
                  className="w-full pl-4 pr-11 py-3.5 rounded-xl border border-gray-200 bg-gray-50 font-mono text-xl font-semibold tracking-[0.25em] uppercase text-gray-900 placeholder:text-gray-300 outline-none transition-shadow focus:bg-white focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <AnimatePresence>
                  {valid && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center"
                    >
                      <Check className="w-4 h-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <button
                type="submit"
                disabled={joining || !valid}
                className={`${press} inline-flex items-center justify-center gap-2 gradient-btn text-white px-6 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:active:scale-100`}
              >
                <Morph active={joining} off="Join class" on="Joining…" />
                {!joining && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
            <p
              id="class-code-hint"
              aria-live="polite"
              className={`mt-2 text-sm ${valid ? 'text-emerald-700' : code.length > 6 || (code.length === 6 && !valid) ? 'text-rose-600' : 'text-gray-500'}`}
            >
              {hint}
            </p>
          </form>

          {classes === null ? (
            <SkeletonCards count={2} />
          ) : classes.length === 0 ? (
            <motion.div {...rise} className="border border-dashed border-gray-300 rounded-2xl px-6 py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-wash text-accent flex items-center justify-center mx-auto">
                <GraduationCap className="w-7 h-7" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 tracking-[-0.01em]">You are not in a class yet</h2>
              <p className="mt-1 text-sm text-gray-500">Ask your teacher for the class code or join link.</p>
            </motion.div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence initial={false}>
                {classes.map((c, i) => (
                  <motion.li
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.03 } }}
                    exit={{ opacity: 0, y: 8 }}
                    className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm"
                  >
                    <h3 className="font-semibold text-lg text-gray-900 tracking-[-0.01em]">{c.name}</h3>
                    <p className="text-sm text-gray-500">{c.section || ' '}</p>
                    <div className="mt-6 flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center"
                      >
                        {initials(c.teacherName)}
                      </span>
                      <div className="text-sm">
                        <p className="text-gray-900">{c.teacherName}</p>
                        <p className="text-xs text-gray-400">Joined {format(new Date(c.joinedAt), 'd MMM yyyy')}</p>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </Motion>
    </DashboardLayout>
  );
};

export default StudentHome;
