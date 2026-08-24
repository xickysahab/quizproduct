import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';

const SettingsPage: React.FC = () => {
  const { user, login } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put('/auth/password', { currentPassword, newPassword });
      if (res.data.token && user) {
        login(user, res.data.token);
      }
      toast.success('Password updated!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <div className="space-y-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

        {/* Account info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-accent-wash flex items-center justify-center text-accent">
              <UserIcon className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Account</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Name</p>
              <p className="font-medium text-gray-900">{user?.name}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Email</p>
              <p className="font-medium text-gray-900">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Role</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-wash text-accent text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-accent-wash flex items-center justify-center text-accent">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Change Password</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all shadow-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all shadow-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="gradient-btn text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50"
            >
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {user?.role === 'TENANT' && <OrganizationSettings />}
      </div>
    </DashboardLayout>
  );
};

const OrganizationSettings: React.FC = () => {
  const [org, setOrg] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/org/me').then((res) => {
      setOrg(res.data.organization);
      setUsage(res.data.usage);
      setLogoUrl(res.data.organization.logoUrl || '');
      setPrimaryColor(res.data.organization.primaryColor || '');
    }).catch(() => undefined);
  }, []);

  if (!org) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/org/me', { logoUrl, primaryColor });
      toast.success('Branding saved');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save branding');
    } finally {
      setSaving(false);
    }
  };

  const checkout = async () => {
    try {
      const res = await api.post('/billing/checkout');
      if (res.data.url) window.location.href = res.data.url;
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Billing is not configured');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Organization</h2>
      <p className="text-sm text-gray-500">
        Plan: <strong>{org.plan}</strong>
        {usage && ` · ${usage.eventsCreated}/${usage.limits.eventsPerMonth} quizzes this month · ${usage.limits.participantsPerEvent} participants / quiz`}
      </p>
      <form onSubmit={save} className="space-y-3">
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="Logo URL"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
        />
        <input
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          placeholder="Primary color (#4F46E5)"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
        />
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="gradient-btn text-white font-semibold px-6 py-3 rounded-xl disabled:opacity-50">
            Save branding
          </button>
          {org.plan === 'FREE' && (
            <button type="button" onClick={checkout} className="px-6 py-3 rounded-xl border border-accent-soft text-accent font-semibold text-sm">
              Upgrade to Pro
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
