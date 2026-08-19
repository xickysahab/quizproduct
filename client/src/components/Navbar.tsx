import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Menu, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from './Logo';

const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#0B0F1A]/80 backdrop-blur-xl border-b border-[#8B5CF6]/10 py-3 shadow-[0_4px_30px_-10px_rgba(139,92,246,0.15)]'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <Logo size={38} className="group-hover:scale-105 transition-transform duration-300" />
          <div className="flex flex-col">
            <span className="font-heading text-xl font-bold tracking-tight text-white group-hover:text-[#A78BFA] transition-colors">
              QuizPulse
            </span>
            <span className="text-[9px] tracking-[0.2em] text-[#64748B] uppercase font-medium -mt-0.5">
              Live Engagement
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link
            to="/"
            className={`transition-colors hover:text-white ${
              location.pathname === '/' ? 'text-white font-semibold' : 'text-[#94A3B8]'
            }`}
          >
            Join Quiz
          </Link>
          <a href="#features" className="transition-colors hover:text-white text-[#94A3B8]">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-white text-[#94A3B8]">
            How It Works
          </a>
        </nav>

        {/* Desktop Action CTAs */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1E293B] text-white text-sm font-medium border border-[#8B5CF6]/20 hover:border-[#8B5CF6]/40 hover:bg-[#1E293B]/80 transition-all hover-glow"
              >
                <LayoutDashboard className="w-4 h-4 text-[#8B5CF6]" />
                <span>Dashboard</span>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-[#64748B] hover:text-white hover:bg-[#1E293B] transition-all"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-btn text-white text-sm font-semibold hover:opacity-90 transition-all shadow-glow-sm hover:shadow-glow-md hover:-translate-y-0.5 duration-200"
              >
                <span>Host Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-xl text-white hover:bg-[#1E293B] transition-colors"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#111827] border-b border-[#8B5CF6]/10 px-6 py-6"
          >
            <div className="flex flex-col gap-4">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-white py-2 border-b border-[#1E293B]"
              >
                Join Quiz
              </Link>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-[#94A3B8] py-2 border-b border-[#1E293B]"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-[#94A3B8] py-2 border-b border-[#1E293B]"
              >
                How It Works
              </a>

              {isAuthenticated ? (
                <div className="pt-2 flex flex-col gap-3">
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl gradient-btn text-white font-medium"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Host Dashboard</span>
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="py-2 text-[#94A3B8] hover:text-white font-medium"
                  >
                    Log Out ({user?.name})
                  </button>
                </div>
              ) : (
                <div className="pt-2 flex flex-col gap-3">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-3 rounded-xl gradient-btn text-white font-medium"
                  >
                    Host Sign In
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
