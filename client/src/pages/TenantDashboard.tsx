import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Building2, Users, LayoutList, Settings } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

const TenantDashboard = () => {
  const { user } = useAuth();

  if (user?.role !== 'TENANT') {
    return <Navigate to="/login" replace />;
  }

  const sidebarItems = [
    { name: 'Org Overview', href: '/tenant', icon: Building2 },
    { name: 'Staff Management', href: '/tenant/staff', icon: Users },
    { name: 'All Org Quizzes', href: '/tenant/quizzes', icon: LayoutList },
    { name: 'Org Settings', href: '/tenant/settings', icon: Settings },
  ];

  return (
    <DashboardLayout title="Tenant Organization" sidebarItems={sidebarItems} showCreateQuiz={true}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-[#94A3B8]">
          Organization Dashboard
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[
            { label: 'Total Staff', value: '8' },
            { label: 'Total Quizzes Hosted', value: '45' },
            { label: 'Total Participants', value: '1,204' },
          ].map((stat, i) => (
            <div key={i} className="bg-[#111827] border border-[#8B5CF6]/20 p-6 rounded-2xl shadow-glow-sm">
              <p className="text-[#94A3B8] text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-[#111827] border border-[#8B5CF6]/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">My Staff Members</h2>
          <p className="text-[#94A3B8]">Table of Staff created by this Tenant will go here...</p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TenantDashboard;
