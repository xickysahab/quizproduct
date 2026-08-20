import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Mail, Lock, User as UserIcon, Users } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  parentUser?: { name: string; email: string } | null;
  _count?: { subUsers?: number; events?: number };
}

interface UserManagementProps {
  pageTitle: string;
  entityLabel: string;      // e.g. "SubAdmin"
  fetchUrl: string;         // e.g. "/superadmin/subadmins"
  createUrl?: string;       // omit for read-only listings
  countLabel?: string;      // label for the _count column, e.g. "Tenants"
}

const UserManagement: React.FC<UserManagementProps> = ({ pageTitle, entityLabel, fetchUrl, createUrl, countLabel }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await api.get(fetchUrl);
      setUsers(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to load ${entityLabel}s`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUrl]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUrl) return;

    setCreating(true);
    try {
      await api.post(createUrl, form);
      toast.success(`${entityLabel} created!`);
      setForm({ name: '', email: '', password: '' });
      setModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to create ${entityLabel}`);
    } finally {
      setCreating(false);
    }
  };

  const showManagedBy = users.some((u) => u.parentUser);
  const showCount = countLabel && users.some((u) => u._count);

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {users.length} {entityLabel}{users.length === 1 ? '' : 's'} total
            </p>
          </div>
          {createUrl && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 gradient-btn text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Add {entityLabel}
            </button>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-[10px] uppercase tracking-wider bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email</th>
                  {showManagedBy && <th className="px-6 py-4">Managed By</th>}
                  {showCount && <th className="px-6 py-4">{countLabel}</th>}
                  <th className="px-6 py-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">Loading...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3 text-gray-400">
                        <Users className="w-8 h-8" />
                        <span>No {entityLabel}s yet.{createUrl ? ` Click "Add ${entityLabel}" to create one.` : ''}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{u.name}</td>
                      <td className="px-6 py-4">{u.email}</td>
                      {showManagedBy && (
                        <td className="px-6 py-4 text-gray-500">{u.parentUser?.name || '—'}</td>
                      )}
                      {showCount && (
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-indigo-50 text-indigo-700">
                            {u._count?.subUsers ?? u._count?.events ?? 0}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(u.createdAt), 'MMM dd, yyyy')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create user modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl relative z-10 border border-gray-200"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-gray-900">Add {entityLabel}</h2>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
                      placeholder={`${entityLabel} name`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
                      placeholder="user@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
                      placeholder="Min. 6 characters"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full mt-4 gradient-btn text-white font-semibold py-3 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                >
                  {creating ? 'Creating...' : `Create ${entityLabel}`}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default UserManagement;
