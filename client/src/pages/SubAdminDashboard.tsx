import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Activity, HelpCircle } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

const SubAdminDashboard = () => {
  const { user } = useAuth();

  if (user?.role !== 'SUBADMIN') {
    return <Navigate to="/login" replace />;
  }

  const sidebarItems = [
    { name: 'Overview', href: '/subadmin', icon: LayoutDashboard },
    { name: 'Tenants', href: '/subadmin/tenants', icon: Building2 },
    { name: 'Activity Logs', href: '/subadmin/logs', icon: Activity },
    { name: 'Support Tickets', href: '/subadmin/support', icon: HelpCircle },
  ];

  return (
    <DashboardLayout title="SubAdmin Panel" sidebarItems={sidebarItems}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Organization Overview
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[
            { label: 'My Tenants', value: '12' },
            { label: 'Active Quizzes (My Tenants)', value: '34' },
            { label: 'Pending Support Tickets', value: '3' },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover-card">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">My Tenants List</h2>
          <p className="text-gray-500">Table of Tenants created by this SubAdmin will go here...</p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SubAdminDashboard;
