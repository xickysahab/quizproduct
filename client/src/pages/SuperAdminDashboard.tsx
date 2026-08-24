import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';
import { useAuth } from '../context/AuthContext';

interface RecentLog {
  id: string;
  action: string;
  resource: string;
  createdAt: string;
  details?: any;
  user: { name: string; email: string; role: string };
}

interface PlatformStats {
  subAdmins: number;
  tenants: number;
  staff: number;
  events: number;
  participants: number;
  recentLogs: RecentLog[];
}

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/superadmin/stats');
        setStats(response.data);
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Failed to load platform stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total SubAdmins', value: stats?.subAdmins },
    { label: 'Total Tenants', value: stats?.tenants },
    { label: 'Total Staff', value: stats?.staff },
    { label: 'Quizzes Hosted', value: stats?.events },
    { label: 'Total Participants', value: stats?.participants },
  ];

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)} showCreateQuiz={true}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Platform Overview
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover-card">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {loading ? '…' : stat.value ?? 0}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 pb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-[10px] uppercase tracking-wider bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Resource</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-400">Loading...</td></tr>
                ) : !stats?.recentLogs?.length ? (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-400">No activity yet.</td></tr>
                ) : (
                  stats.recentLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(log.createdAt), 'MMM dd, HH:mm')}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-medium text-gray-900">{log.user.name}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-bold text-gray-500">{log.user.role}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-accent-wash text-accent">{log.action}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-700">{log.resource}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SuperAdminDashboard;
