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
    <div className="min-h-screen bg-[#0B0F1A] text-white font-sans flex flex-col">
      {/* Navbar will handle the top navigation and logo */}
      <Navbar />

      <div className="flex flex-1 pt-[72px]">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col bg-[#111827] border-r border-[#8B5CF6]/10 pt-8 px-4">
          <div className="mb-8 px-2">
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              {title}
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1">Welcome, {user?.name}</p>
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
                      ? 'bg-[#8B5CF6]/10 text-white border border-[#8B5CF6]/20'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-[#8B5CF6]' : ''}`} />
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
