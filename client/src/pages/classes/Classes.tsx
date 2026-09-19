import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, GraduationCap, Plus, Users } from 'lucide-react';
import api from '../../services/api';
import DashboardLayout from '../../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../../config/sidebar';
import { useAuth } from '../../context/AuthContext';
import { Motion, SkeletonCards } from '../../components/classroom/ui';
import { field, label, press, rise, spring } from '../../components/classroom/style';

/**
 * Teacher side of classes — kept apart from the quiz pages on purpose: this is
 * the long-lived student roster, not a one-off live session.
 */

export interface ClassroomSummary {
  id: string;
  name: string;
  section: string | null;
  joinCode: string;
  studentCount: number;
  teacher?: { id: string; name: string } | null;
}

const Classes: React.FC = () => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassroomSummary[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const canCreate = user?.role === 'TENANT' || user?.role === 'STAFF';

  useEffect(() => {
    api
      .get('/classrooms')
      .then((res) => setClasses(res.data.classrooms))
      .catch((error) => {
        toast.error(error.response?.data?.message || 'Could not load classes.');
        setClasses([]);
      });
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/classrooms', { name, section });
      setClasses((prev) => [res.data.classroom, ...(prev || [])]);
      setName('');
      setSection('');
      setFormOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not create the class.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <Motion>
        <div className="max-w-6xl space-y-8">
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-[2rem] leading-[1.1] tracking-[-0.02em] font-bold text-gray-900">Classes</h1>
              <p className="text-[15px] text-gray-500 mt-2">
                Students join once with a code and stay until you remove them.
              </p>
            </div>
            {canCreate && (
              <button
                onClick={() => setFormOpen((open) => !open)}
                aria-expanded={formOpen}
                className={`${press} self-start sm:self-auto inline-flex items-center gap-2 gradient-btn text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm`}
              >
                <motion.span animate={{ rotate: formOpen ? 45 : 0 }} className="inline-flex">
                  <Plus className="w-4 h-4" />
                </motion.span>
                {formOpen ? 'Cancel' : 'New class'}
              </button>
            )}
          </header>

          {/* Opens under the button that asked for it, and folds back up the same way. */}
          <AnimatePresence initial={false}>
            {formOpen && (
              <motion.form
                key="new-class"
                onSubmit={create}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onAnimationComplete={() => formOpen && nameRef.current?.focus()}
                className="overflow-hidden"
              >
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                  <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
                    <label className="block">
                      <span className={label}>Class name</span>
                      <input
                        ref={nameRef}
                        required
                        maxLength={80}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Class 10 A"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className={label}>
                        Section or subject <span className="normal-case tracking-normal font-normal">(optional)</span>
                      </span>
                      <input
                        maxLength={80}
                        value={section}
                        onChange={(e) => setSection(e.target.value)}
                        placeholder="Physics"
                        className={field}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={saving || !name.trim()}
                      className={`${press} gradient-btn text-white px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:active:scale-100`}
                    >
                      {saving ? 'Creating…' : 'Create class'}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {classes === null ? (
            <SkeletonCards />
          ) : classes.length === 0 ? (
            <motion.div {...rise} className="bg-white border border-dashed border-gray-300 rounded-2xl px-6 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-wash text-accent flex items-center justify-center mx-auto">
                <GraduationCap className="w-7 h-7" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 tracking-[-0.01em]">No classes yet</h2>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                {canCreate
                  ? 'Create a class, then share its code. Students who join stay in it until you remove them.'
                  : 'Classes your teachers create will appear here.'}
              </p>
            </motion.div>
          ) : (
            <motion.ul layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence initial={false}>
                {classes.map((c, i) => (
                  <motion.li
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.03 } }}
                    exit={{ opacity: 0, y: 8 }}
                  >
                    <Link
                      to={`/classes/${c.id}`}
                      className="group block h-full bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-[transform,box-shadow] duration-100 ease-out active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-lg text-gray-900 tracking-[-0.01em] truncate">{c.name}</h3>
                          <p className="text-sm text-gray-500 truncate">{c.section || 'No section'}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                      </div>
                      <div className="mt-6 flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-1.5 text-gray-600">
                          <Users className="w-4 h-4" />
                          {c.studentCount} student{c.studentCount === 1 ? '' : 's'}
                        </span>
                        <span className="font-mono text-[13px] font-semibold tracking-[0.15em] text-accent bg-accent-wash px-2.5 py-1 rounded-md">
                          {c.joinCode}
                        </span>
                      </div>
                      {c.teacher && c.teacher.id !== user?.id && (
                        <p className="mt-3 text-xs text-gray-400">Teacher: {c.teacher.name}</p>
                      )}
                    </Link>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </Motion>
    </DashboardLayout>
  );
};

export default Classes;
