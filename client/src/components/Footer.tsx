import React from 'react';
import { Link } from 'react-router-dom';
import brandLogo from '../assets/Sahaj spirit.jpeg';

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#FFFFFF] border-t border-[#E0F2FE] pt-16 pb-12 px-6 md:px-12">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
        {/* Brand & Description */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <img 
              src={brandLogo} 
              alt="Sahaj Spirit Logo" 
              className="w-9 h-9 rounded-xl object-cover border border-[#E0F2FE]"
            />
            <span className="font-serif text-2xl font-semibold tracking-tight text-[#0F172A]">
              SAHAJOMETER
            </span>
          </div>
          <p className="text-[#475569] text-sm leading-relaxed max-w-sm">
            Crafting serene, captivating live interactions for classrooms, conferences, and virtual stages worldwide.
          </p>
        </div>

        {/* Column 1 - Product */}
        <div>
          <h4 className="font-medium text-[#0F172A] text-sm tracking-wide uppercase mb-4">
            Platform
          </h4>
          <ul className="space-y-2.5 text-sm text-[#475569]">
            <li>
              <Link to="/" className="hover:text-[#0F172A] transition-colors">
                Live Join
              </Link>
            </li>
            <li>
              <a href="#features" className="hover:text-[#0F172A] transition-colors">
                Features & Design
              </a>
            </li>
            <li>
              <a href="#how-it-works" className="hover:text-[#0F172A] transition-colors">
                How It Works
              </a>
            </li>
          </ul>
        </div>

        {/* Column 2 - Hosts */}
        <div>
          <h4 className="font-medium text-[#0F172A] text-sm tracking-wide uppercase mb-4">
            Host Portal
          </h4>
          <ul className="space-y-2.5 text-sm text-[#475569]">
            <li>
              <Link to="/login" className="hover:text-[#0F172A] transition-colors">
                Sign In
              </Link>
            </li>
            <li>
              <Link to="/register" className="hover:text-[#0F172A] transition-colors">
                Create Account
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:text-[#0F172A] transition-colors">
                Host Dashboard
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-8 border-t border-[#E0F2FE]/60 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#94A3B8]">
        <p>© {new Date().getFullYear()} Sahajometer. All rights reserved.</p>
        <p className="font-serif italic text-sm text-[#475569]">Designed with elegance and purpose.</p>
      </div>
    </footer>
  );
};

export default Footer;
