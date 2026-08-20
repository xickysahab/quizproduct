import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';
import { useAuth } from '../context/AuthContext';

interface SubAdminStats {
  tenants: number;
  staff: number;
  events: number;
  participants: number;
}

const SubAdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<SubAdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/subadmin/stats');
        setStats(response.data);
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'My Tenants', value: stats?.tenants },
    { label: 'Staff In My Org', value: stats?.staff },
    { label: 'Quizzes In My Org', value: stats?.events },
    { label: 'Total Participants', value: stats?.participants },
  ];

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)} showCreateQuiz={true}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Organization Overview
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover-card">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {loading ? '…' : stat.value ?? 0}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Quick Actions</h2>
          <p className="text-gray-500 text-sm mb-4">Manage your organization from here.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/subadmin/tenants" className="px-4 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition-all">
              Manage Tenants
            </Link>
            <Link to="/subadmin/quizzes" className="px-4 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition-all">
              View Quizzes
            </Link>
            <Link to="/subadmin/logs" className="px-4 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition-all">
              Activity Logs
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SubAdminDashboard;
