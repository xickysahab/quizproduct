import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

const Footer: React.FC = () => {
  return (
    <footer className="stage border-t border-[color:var(--color-stage-3)] pt-14 pb-10 px-6 md:px-12">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
        {/* Brand & Description */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <span className="font-heading text-xl font-bold tracking-tight text-[color:var(--color-stage-ink)]">
              QuizPulse
            </span>
          </div>
          <p className="text-[#64748B] text-sm leading-relaxed max-w-sm">
            Real-time live quizzes, polls, and audience engagement for classrooms, conferences, and virtual events worldwide.
          </p>
        </div>

        {/* Column 1 - Product */}
        <div>
          <h4 className="font-heading font-semibold text-[color:var(--color-stage-ink)] text-sm tracking-wide uppercase mb-4">
            Platform
          </h4>
          <ul className="space-y-2.5 text-sm text-[#64748B]">
            <li>
              <Link to="/" className="hover:text-[#A78BFA] transition-colors">
                Live Join
              </Link>
            </li>
            <li>
              <a href="#features" className="hover:text-[#A78BFA] transition-colors">
                Features
              </a>
            </li>
            <li>
              <a href="#how-it-works" className="hover:text-[#A78BFA] transition-colors">
                How It Works
              </a>
            </li>
          </ul>
        </div>

        {/* Column 2 - Hosts */}
        <div>
          <h4 className="font-heading font-semibold text-[color:var(--color-stage-ink)] text-sm tracking-wide uppercase mb-4">
            Host Portal
          </h4>
          <ul className="space-y-2.5 text-sm text-[#64748B]">
            <li>
              <Link to="/login" className="hover:text-[#A78BFA] transition-colors">
                Sign In
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:text-[#A78BFA] transition-colors">
                Host Dashboard
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-8 border-t border-[#1E293B] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#475569]">
        <p>© {new Date().getFullYear()} QuizPulse. All rights reserved.</p>
        <p className="text-sm text-[#64748B]">Built for live engagement.</p>
      </div>
    </footer>
  );
};

export default Footer;
