import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Sparkles, ArrowRight, ShieldCheck, Zap, BarChart3, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const Join: React.FC = () => {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      setRoomCode(codeParam.toUpperCase());
    }
  }, [location.search]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!roomCode.trim() || !name.trim()) {
      setError('Please provide both room code and your name');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/participants/join', {
        roomCode: roomCode.trim().toUpperCase(),
        name: name.trim(),
      });

      // Save participant session in localStorage
      localStorage.setItem('participantId', response.data.participant.id);
      localStorage.setItem('participantName', response.data.participant.name);
      localStorage.setItem('eventId', response.data.event.id);

      // Navigate to live quiz waiting room
      navigate(`/live/${roomCode.trim().toUpperCase()}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to join room. Please verify the 6-character room code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#F1F5F9] flex flex-col font-sans relative selection:bg-[#8B5CF6]/30">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 md:pt-44 pb-24 md:pb-36 px-6 md:px-12 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="orb orb-violet w-[500px] h-[500px] -top-40 -left-40" />
        <div className="orb orb-coral w-[400px] h-[400px] top-20 right-[-150px]" />
        <div className="orb orb-cyan w-[350px] h-[350px] bottom-[-100px] left-1/3" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center relative z-10">
          
          {/* Hero Content Left */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 space-y-8 text-left order-2 lg:order-1"
          >
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/20">
              <Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span className="text-xs font-semibold tracking-wider text-[#A78BFA] uppercase">
                Real-Time Audience Engagement
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="font-heading text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight">
              Live quizzes that{' '}
              <span className="gradient-text">electrify</span>{' '}
              your audience.
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-[#94A3B8] leading-relaxed max-w-xl font-normal">
              Launch interactive polls, live quizzes, and real-time Q&A sessions. Zero downloads, instant sync, beautifully designed.
            </p>

            {/* Quick Metrics & Feature Highlights */}
            <div className="pt-2 flex flex-wrap items-center gap-6 text-sm text-[#94A3B8]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span>No app download required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span>Instant WebSocket syncing</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span>Beautiful dark interface</span>
              </div>
            </div>
          </motion.div>

          {/* Hero Form Right — Floating Room Join Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 order-1 lg:order-2"
          >
            <div className="bg-[#111827] rounded-3xl p-8 md:p-10 shadow-card border border-[#8B5CF6]/15 relative gradient-border hover-glow">
              <div className="text-center mb-8">
                <span className="text-[11px] font-semibold tracking-[0.2em] text-[#8B5CF6] uppercase">
                  Participant Portal
                </span>
                <h2 className="font-heading text-3xl font-bold text-white mt-1">
                  Join a Live Session
                </h2>
                <p className="text-sm text-[#64748B] mt-1">
                  Enter the 6-character room code provided by your host
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-[#FB7185] px-4 py-3 rounded-2xl text-xs font-medium text-center mb-6"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleJoin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-2 text-left">
                    Room Code
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-5 py-4 text-center text-3xl font-mono font-bold tracking-[0.25em] uppercase rounded-2xl border border-[#1E293B] bg-[#0B0F1A] text-white focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all placeholder:tracking-normal placeholder:font-sans placeholder:font-normal placeholder:text-[#475569] placeholder:text-base"
                    placeholder="E.G. A1B2C3"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-2 text-left">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-5 py-3.5 text-base rounded-2xl border border-[#1E293B] bg-[#0B0F1A] text-white focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all placeholder:text-[#475569]"
                    placeholder="Enter your name or alias"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={25}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || roomCode.length < 6 || name.length < 2}
                  className="w-full gradient-btn text-white text-base font-semibold py-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-glow-md active:scale-[0.99] flex items-center justify-center gap-2 group mt-2 shadow-glow-sm"
                >
                  <span>{loading ? 'Connecting...' : 'Enter Live Quiz'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </form>

            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section id="features" className="py-24 px-6 md:px-12 bg-[#0B0F1A] border-t border-[#8B5CF6]/10 relative">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
              Designed for High Engagement
            </span>
            <h2 className="font-heading text-4xl md:text-5xl font-bold text-white">
              Every element crafted with{' '}
              <span className="gradient-text">intention</span>.
            </h2>
            <p className="text-[#64748B] text-base leading-relaxed">
              Remove friction between speakers and participants with stunning visuals and instant real-time synchronization.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              className="bg-[#111827] rounded-3xl p-8 border border-[#8B5CF6]/10 shadow-card space-y-5 hover-glow transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/15 flex items-center justify-center text-[#8B5CF6]">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-white">
                Instant Syncing
              </h3>
              <p className="text-[#64748B] text-sm leading-relaxed">
                Powered by WebSockets for zero latency. Answers, timers, and leaderboard positions update live across hundreds of connected devices.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              className="bg-[#111827] rounded-3xl p-8 border border-[#F43F5E]/10 shadow-card space-y-5 hover-glow transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#F43F5E]/15 flex items-center justify-center text-[#F43F5E]">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-white">
                Real-Time Analytics
              </h3>
              <p className="text-[#64748B] text-sm leading-relaxed">
                Observe live participant response breakdowns as they submit. Host control options allow you to reveal solutions or pause timer instantly.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              className="bg-[#111827] rounded-3xl p-8 border border-[#06B6D4]/10 shadow-card space-y-5 hover-glow transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#06B6D4]/15 flex items-center justify-center text-[#06B6D4]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-white">
                Premium Design
              </h3>
              <p className="text-[#64748B] text-sm leading-relaxed">
                A dark-mode interface with smooth micro-animations, glassmorphism, and vibrant accents eliminates distraction so participants stay focused.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="how-it-works" className="py-24 px-6 md:px-12 bg-[#111827] border-t border-[#8B5CF6]/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
              Simple Three-Step Process
            </span>
            <h2 className="font-heading text-4xl font-bold text-white mt-2">
              How QuizPulse Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full gradient-btn text-white font-heading text-2xl font-bold flex items-center justify-center shadow-glow-sm">
                1
              </div>
              <h3 className="font-heading text-xl font-bold text-white">Create & Schedule</h3>
              <p className="text-sm text-[#64748B] leading-relaxed max-w-xs">
                Build your quiz questions, set answer timers, and generate a unique 6-character room code in seconds.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full gradient-btn text-white font-heading text-2xl font-bold flex items-center justify-center shadow-glow-sm">
                2
              </div>
              <h3 className="font-heading text-xl font-bold text-white">Share Room Code</h3>
              <p className="text-sm text-[#64748B] leading-relaxed max-w-xs">
                Display the room PIN on screen. Audience members join instantly on mobile or desktop without downloads.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full gradient-btn text-white font-heading text-2xl font-bold flex items-center justify-center shadow-glow-sm">
                3
              </div>
              <h3 className="font-heading text-xl font-bold text-white">Host & Engage</h3>
              <p className="text-sm text-[#64748B] leading-relaxed max-w-xs">
                Advance questions live, display option distributions, and celebrate top participants with instant leaderboards.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Join;
