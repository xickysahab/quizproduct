import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';

const Organizations: React.FC = () => {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<any[]>([]);

  const load = async () => {
    const res = await api.get('/org');
    setOrgs(res.data.organizations || []);
  };

  useEffect(() => {
    load().catch((error) => toast.error(error.response?.data?.message || 'Failed to load organizations'));
  }, []);

  const setPlan = async (id: string, plan: string) => {
    try {
      await api.patch(`/org/${id}/plan`, { plan });
      toast.success('Plan updated');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not update plan');
    }
  };

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-right">Users</th>
                <th className="px-4 py-3 text-right">Quizzes</th>
                <th className="px-4 py-3 text-left">Assign plan</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{org.name}</td>
                  <td className="px-4 py-3">{org.plan}</td>
                  <td className="px-4 py-3 text-right">{org._count?.users ?? 0}</td>
                  <td className="px-4 py-3 text-right">{org._count?.events ?? 0}</td>
                  <td className="px-4 py-3">
                    <select
                      value={org.plan}
                      onChange={(e) => setPlan(org.id, e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PRO">PRO</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Organizations;
