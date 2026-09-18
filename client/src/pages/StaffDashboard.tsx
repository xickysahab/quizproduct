import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';
import { useAuth } from '../context/AuthContext';
import RecentQuizzes from '../components/RecentQuizzes';

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
    { label: 'Quizzes', value: stats?.events },
    { label: 'Live now', value: stats?.liveEvents },
    { label: 'Participants', value: stats?.participants },
  ];

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)} showCreateQuiz={true}>
      <div className="space-y-8">
        <h1 className="text-[34px] font-bold text-ink">Overview</h1>

        <div className="grid grid-cols-3 gap-3">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-surface border border-line px-5 py-4 rounded-2xl">
              <p className="text-[13px] text-muted">{stat.label}</p>
              <p className="text-[28px] font-bold text-ink tabular mt-0.5">{loading ? '–' : stat.value ?? 0}</p>
            </div>
          ))}
        </div>

        <RecentQuizzes allHref="/staff/quizzes" />
      </div>
    </DashboardLayout>
  );
};

export default StaffDashboard;
