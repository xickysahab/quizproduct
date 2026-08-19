import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Menu, X, PlusCircle } from 'lucide-react';
import Navbar from './Navbar';

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebarItems: SidebarItem[];
  title: string;
  showCreateQuiz?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, sidebarItems, title, showCreateQuiz }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Navbar will handle the top navigation and logo */}
      <Navbar />

      <div className="flex flex-1 pt-[72px]">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-200 pt-8 px-4 shadow-sm z-10">
          <div className="mb-8 px-2">
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-indigo-800">
              {title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Welcome, {user?.name}</p>
          </div>

          <nav className="flex-1 space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : ''}`} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {showCreateQuiz && (
            <div className="mt-auto mb-8 px-2">
              <button 
                onClick={() => {
                  /* Logic to open quiz creation modal or navigate */
                  alert("Create Quiz Clicked");
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl gradient-btn text-white font-semibold hover:shadow-glow-md transition-all"
              >
                <PlusCircle className="w-5 h-5" />
                Create Quiz
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-8 lg:p-12 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
