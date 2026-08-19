import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Menu, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import brandLogo from '../assets/Sahaj spirit.jpeg';

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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#FFFFFF]/85 backdrop-blur-md border-b border-[#E0F2FE] py-3 shadow-lux'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <img 
            src={brandLogo} 
            alt="Sahaj Spirit Logo" 
            className="w-10 h-10 rounded-xl object-cover shadow-md group-hover:scale-105 transition-transform duration-300 border border-[#E0F2FE]"
          />
          <div className="flex flex-col">
            <span className="font-serif text-2xl font-semibold tracking-tight text-[#0F172A] group-hover:text-[#06B6D4] transition-colors">
              SAHAJOMETER
            </span>
            <span className="text-[10px] tracking-[0.25em] text-[#475569] uppercase font-medium -mt-1">
              Interactive Quiz
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#334155]">
          <Link
            to="/"
            className={`transition-colors hover:text-[#0F172A] ${
              location.pathname === '/' ? 'text-[#0F172A] font-semibold' : 'text-[#475569]'
            }`}
          >
            Join Quiz
          </Link>
          <a href="#features" className="transition-colors hover:text-[#0F172A] text-[#475569]">
            Experience
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-[#0F172A] text-[#475569]">
            Workflow
          </a>
        </nav>

        {/* Desktop Action CTAs */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F0F9FF] text-[#0F172A] text-sm font-medium border border-[#E0F2FE] hover:bg-[#E0F2FE] transition-all"
              >
                <LayoutDashboard className="w-4 h-4 text-[#06B6D4]" />
                <span>Dashboard</span>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#F0F9FF] transition-all"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F97316] text-[#FFFFFF] text-sm font-medium hover:bg-[#EA580C] transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 duration-200"
              >
                <span>Host Sign In</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#06B6D4]" />
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-xl text-[#0F172A] hover:bg-[#F0F9FF] transition-colors"
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
            className="md:hidden bg-[#FFFFFF] border-b border-[#E0F2FE] px-6 py-6"
          >
            <div className="flex flex-col gap-4">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-[#0F172A] py-2 border-b border-[#F0F9FF]"
              >
                Join Quiz
              </Link>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-[#475569] py-2 border-b border-[#F0F9FF]"
              >
                Experience
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-[#475569] py-2 border-b border-[#F0F9FF]"
              >
                Workflow
              </a>

              {isAuthenticated ? (
                <div className="pt-2 flex flex-col gap-3">
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F97316] text-[#FFFFFF] font-medium"
                  >
                    <LayoutDashboard className="w-4 h-4 text-[#06B6D4]" />
                    <span>Host Dashboard</span>
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="py-2 text-[#475569] hover:text-[#0F172A] font-medium"
                  >
                    Log Out ({user?.name})
                  </button>
                </div>
              ) : (
                <div className="pt-2 flex flex-col gap-3">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-3 rounded-xl bg-[#F97316] text-[#FFFFFF] font-medium"
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
