import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';
import { useAuth } from '../context/AuthContext';

interface StaffStats {
  events: number;
  liveEvents: number;
  participants: number;
}

const StaffDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/staff/stats');
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
    { label: 'My Total Quizzes', value: stats?.events },
    { label: 'Live Sessions', value: stats?.liveEvents },
    { label: 'Participants Reached', value: stats?.participants },
  ];

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)} showCreateQuiz={true}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome Back, {user?.name}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">My Quizzes</h2>
            <Link
              to="/staff/quizzes"
              className="px-4 py-2 bg-accent-wash text-accent border border-accent-soft rounded-xl text-sm font-medium hover:bg-accent-wash transition-all"
            >
              View All
            </Link>
          </div>
          <p className="text-gray-500 text-sm">
            Create, edit and host your quizzes from the "My Quizzes" page.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StaffDashboard;
