import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Building2, Activity, Settings, ListPlus } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

const SuperAdminDashboard = () => {
  const { user } = useAuth();

  if (user?.role !== 'SUPERADMIN') {
    return <Navigate to="/login" replace />;
  }

  const sidebarItems = [
    { name: 'Overview', href: '/superadmin', icon: LayoutDashboard },
    { name: 'SubAdmins', href: '/superadmin/subadmins', icon: Users },
    { name: 'All Tenants', href: '/superadmin/tenants', icon: Building2 },
    { name: 'All Quizzes', href: '/superadmin/quizzes', icon: ListPlus },
    { name: 'Activity Logs', href: '/superadmin/logs', icon: Activity },
    { name: 'Settings', href: '/superadmin/settings', icon: Settings },
  ];

  return (
    <DashboardLayout title="SuperAdmin Panel" sidebarItems={sidebarItems} showCreateQuiz={true}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Platform Overview
        </h1>
        
        {/* Placeholder Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            { label: 'Total SubAdmins', value: '4' },
            { label: 'Total Tenants', value: '24' },
            { label: 'Total Active Staff', value: '156' },
            { label: 'Quizzes Hosted', value: '892' }
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover-card">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Recent Activity Table Placeholder */}
        <div className="mt-12 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent SubAdmin Activity</h2>
          <p className="text-gray-500">Activity table will be displayed here...</p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SuperAdminDashboard;
