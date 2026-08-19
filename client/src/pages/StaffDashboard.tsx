import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Presentation, Activity, Settings, PlusCircle } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';

const StaffDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [eventsCount, setEventsCount] = useState(0);

  if (user?.role !== 'STAFF') {
    return <Navigate to="/login" replace />;
  }

  const sidebarItems = [
    { name: 'My Dashboard', href: '/staff', icon: LayoutDashboard },
    { name: 'My Quizzes', href: '/staff/quizzes', icon: Presentation },
    { name: 'Reports', href: '/staff/reports', icon: Activity },
    { name: 'Profile Settings', href: '/staff/settings', icon: Settings },
  ];

  return (
    <DashboardLayout title="Staff Portal" sidebarItems={sidebarItems} showCreateQuiz={true}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome Back, {user?.name}
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[
            { label: 'My Total Quizzes', value: '15' },
            { label: 'Live Sessions', value: '0' },
            { label: 'Total Participants Reached', value: '342' },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover-card">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Recent Quizzes</h2>
            <button 
              onClick={() => alert('Create quiz flow')}
              className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-all"
            >
              View All
            </button>
          </div>
          <p className="text-gray-500">Quiz grid component will go here (migrated from the old Dashboard.tsx)</p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StaffDashboard;
