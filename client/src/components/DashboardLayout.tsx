import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PlusCircle } from 'lucide-react';
import Navbar from './Navbar';
import CreateQuizModal from './CreateQuizModal';

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
  const { user } = useAuth();
  const location = useLocation();
  const [createQuizOpen, setCreateQuizOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Navbar will handle the top navigation and logo */}
      <Navbar />

      <div className="flex flex-1 pt-[72px]">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-200 pt-8 px-4 shadow-sm z-10">
          <div className="mb-8 px-2">
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent to-accent">
              {title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Welcome, {user?.name}</p>
          </div>

          <nav className="flex-1 space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;

              /**
               * A landing page sits at the role's root — /superadmin, /tenant —
               * so every other page in the section starts with its path. A plain
               * prefix match therefore lit it up everywhere, and two items looked
               * selected at once.
               *
               * Derived rather than flagged per item: whether something is a
               * landing page is already implied by another item nesting under it,
               * so a new section can be added to the sidebar without remembering
               * to mark anything.
               */
              const isLandingPage = sidebarItems.some(
                (other) => other.href !== item.href && other.href.startsWith(`${item.href}/`)
              );

              // Non-landing pages keep the prefix match, so a detail route like
              // /superadmin/tenants/123 still highlights its section.
              const isActive = isLandingPage
                ? location.pathname === item.href
                : location.pathname === item.href ||
                  location.pathname.startsWith(`${item.href}/`);
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-accent-wash text-accent font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-accent' : ''}`} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {showCreateQuiz && (
            <div className="mt-auto mb-8 px-2">
              <button 
                onClick={() => setCreateQuizOpen(true)}
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

      <CreateQuizModal isOpen={createQuizOpen} onClose={() => setCreateQuizOpen(false)} />
    </div>
  );
};

export default DashboardLayout;
