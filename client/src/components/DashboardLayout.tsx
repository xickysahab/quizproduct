import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, MoreHorizontal, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CreateQuizModal from './CreateQuizModal';
import Sheet from './Sheet';
import Logo from './Logo';

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
  /** For a page below a section (a quiz inside Quizzes): which section it is in. */
  activeHref?: string;
}

/**
 * The signed-in shell. One navigation, always in the same place: a
 * translucent sidebar on a wide screen, a tab bar along the bottom of a phone
 * — the marketing header does not follow a host into their workspace.
 */

/**
 * A landing page sits at the role's root — /superadmin, /tenant — so every
 * other page starts with its path. A plain prefix match lit it up everywhere;
 * a landing page therefore matches only exactly, anything else by prefix so a
 * detail route still highlights its section.
 */
const activeIn = (items: SidebarItem[], path: string) => (item: SidebarItem) => {
  const isLanding = items.some((o) => o.href !== item.href && o.href.startsWith(`${item.href}/`));
  return isLanding ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
};

const initials = (name?: string) =>
  (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** A tab bar holds five at most; past that the rest go behind More. */
const TAB_LIMIT = 5;

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, sidebarItems, title, showCreateQuiz, activeHref }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [createQuizOpen, setCreateQuizOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Each page opens with its own large title; the bar repeats it only once
  // that title has scrolled away, the way a navigation bar does.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 48);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const isActive = activeIn(sidebarItems, activeHref ?? location.pathname);

  const signOut = () => {
    logout();
    navigate('/');
  };

  const tabs = sidebarItems.length > TAB_LIMIT ? sidebarItems.slice(0, TAB_LIMIT - 1) : sidebarItems;
  const overflow = sidebarItems.length > TAB_LIMIT ? sidebarItems.slice(TAB_LIMIT - 1) : [];
  const current = sidebarItems.find(isActive);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ---- Wide screens: sidebar ------------------------------------- */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-64 flex-col material-chrome border-r border-line/70">
        <Link to="/dashboard" className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <Logo size={30} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight text-ink">QuizPulse</p>
            <p className="text-xs text-muted truncate">{title}</p>
          </div>
        </Link>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" aria-label="Sections">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-[10px] text-[15px] ${
                  active ? 'bg-accent-wash text-accent font-semibold' : 'text-ink-soft hover:bg-gray-100'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.9} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-2">
          {showCreateQuiz && (
            <button
              onClick={() => setCreateQuizOpen(true)}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-[15px]"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New quiz
            </button>
          )}
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
            <span className="w-8 h-8 rounded-full bg-accent-wash text-accent text-xs font-bold grid place-items-center shrink-0">
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink truncate">{user?.name}</p>
              <p className="text-xs text-muted truncate">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="w-8 h-8 rounded-full grid place-items-center text-muted hover:bg-gray-100 hover:text-ink"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Phones: title bar ------------------------------------------ */}
      <header className="md:hidden sticky top-0 z-30 material-chrome scroll-edge-bottom">
        <div className="h-12 px-4 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <Logo size={24} />
            <span
              className={`text-[17px] font-semibold truncate transition-opacity ${scrolled ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!scrolled}
            >
              {current?.name ?? title}
            </span>
          </Link>
          {showCreateQuiz && (
            <button
              onClick={() => setCreateQuizOpen(true)}
              aria-label="New quiz"
              className="w-8 h-8 rounded-full bg-accent text-white grid place-items-center"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </header>

      <main className="md:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10 pb-28 md:pb-12">{children}</div>
      </main>

      {/* ---- Phones: tab bar -------------------------------------------- */}
      <nav
        aria-label="Sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 material-chrome border-t border-line/70 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon className="w-6 h-6" strokeWidth={active ? 2.2 : 1.8} />
                <span className="truncate max-w-full px-1">{item.name}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${
              overflow.some(isActive) ? 'text-accent' : 'text-muted'
            }`}
          >
            <MoreHorizontal className="w-6 h-6" strokeWidth={1.8} />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={user?.name || 'Account'} eyebrow={title} size="sm">
        <div className="space-y-1">
          {overflow.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[17px] ${
                  isActive(item) ? 'bg-accent-wash text-accent font-semibold' : 'text-ink hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[17px] text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </Sheet>

      <CreateQuizModal isOpen={createQuizOpen} onClose={() => setCreateQuizOpen(false)} />
    </div>
  );
};

export default DashboardLayout;
