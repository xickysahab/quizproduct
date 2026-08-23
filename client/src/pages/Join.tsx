import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { getSessionKey } from '../utils/session';
import LanguagePicker from '../components/LanguagePicker';
import { useTranslation } from '../i18n/useTranslation';
import { normalizeRoomCode } from '../utils/roomCode';
import { writeRoomBranding, brandTint, type RoomBranding } from '../utils/branding';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Sparkles, ArrowRight, ShieldCheck, Zap, BarChart3, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const Join: React.FC = () => {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [allowAnonymous, setAllowAnonymous] = useState(true);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [branding, setBranding] = useState<RoomBranding | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();

  const loadPublicInfo = async (rawCode: string) => {
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) {
      setRoomTitle(null);
      setBranding(null);
      setPasscodeRequired(false);
      setAllowAnonymous(true);
      return;
    }

    try {
      const res = await api.get(`/events/public/${code}`);
      setRoomTitle(res.data.title || null);
      setPasscodeRequired(Boolean(res.data.passcodeRequired));
      setAllowAnonymous(res.data.allowAnonymous !== false);
      setBranding(res.data.branding || null);
      writeRoomBranding(res.data.branding);
    } catch {
      // Wrong code — keep the form usable; join will surface the real error.
      setRoomTitle(null);
      setBranding(null);
    }
  };

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      const cleaned = codeParam.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      setRoomCode(cleaned);
      void loadPublicInfo(cleaned);
    }
  }, [location.search]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = normalizeRoomCode(roomCode);

    if (!code) {
      setError(t('join.errorCode'));
      return;
    }

    if (!allowAnonymous && !name.trim()) {
      setError(t('join.errorName') || 'The host asked everyone to join with a name.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/participants/join', {
        roomCode: code,
        name: name.trim(),
        sessionKey: getSessionKey(),
        passcode: passcode.trim() || undefined,
      });

      localStorage.setItem('participantId', response.data.participant.id);
      localStorage.setItem('participantName', response.data.participant.name || '');
      localStorage.setItem('eventId', response.data.event.id);
      localStorage.setItem('participantToken', response.data.participantToken);
      localStorage.setItem('qaEnabled', String(response.data.event.qaEnabled !== false));
      localStorage.setItem(
        'sessionMode',
        response.data.event.sessionMode === 'SURVEY' ? 'SURVEY' : 'QUIZ'
      );
      writeRoomBranding(response.data.branding);

      navigate(`/live/${code}`);
    } catch (err: any) {
      if (err.response?.data?.passcodeRequired) setPasscodeRequired(true);
      setError(err.response?.data?.message || t('join.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const accent = branding?.primaryColor || undefined;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans relative selection:bg-indigo-100">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 md:pt-44 pb-24 md:pb-36 px-6 md:px-12 overflow-hidden bg-ambient-glow">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center relative z-10">
          
          {/* Hero Content Left */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 space-y-8 text-left order-2 lg:order-1"
          >
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-xs font-semibold tracking-wider text-indigo-700 uppercase">
                Real-Time Audience Engagement
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="font-heading text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight text-gray-900">
              Live quizzes that{' '}
              <span className="gradient-text">electrify</span>{' '}
              your audience.
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-xl font-normal">
              Launch interactive polls, live quizzes, and real-time Q&A sessions. Zero downloads, instant sync, beautifully designed.
            </p>

            {/* Quick Metrics & Feature Highlights */}
            <div className="pt-2 flex flex-wrap items-center gap-6 text-sm text-gray-500 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>No app download required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Instant WebSocket syncing</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Beautiful, fast interface</span>
              </div>
            </div>
          </motion.div>

          {/* Hero Form Right — Floating Room Join Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 order-1 lg:order-2 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-3xl blur-xl opacity-20 transform -translate-y-2"></div>
            <div className="bg-white rounded-3xl p-8 md:p-10 shadow-xl border border-gray-100 relative hover-card">
              <div className="text-center mb-8">
                <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                  {t('join.eyebrow')}
                </span>
                <h2 className="font-heading text-3xl font-bold text-gray-900 mt-1">
                  {t('join.title')}
                </h2>
                <p className="text-sm text-gray-500 mt-2">
                  {t('join.subtitle')}
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium text-center mb-6 shadow-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleJoin} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 text-left">
                    {t('join.code')}
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-5 py-5 text-center text-4xl font-heading font-bold tracking-[0.22em] uppercase rounded-2xl border-2 border-gray-200 bg-slate-50 text-slate-950 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:tracking-normal placeholder:font-sans placeholder:font-normal placeholder:text-gray-400 placeholder:text-base shadow-sm"
                    placeholder="123 4567"
                    value={roomCode}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^0-9A-Za-z ]/g, '').toUpperCase();
                      setRoomCode(next);
                    }}
                    onBlur={() => void loadPublicInfo(roomCode)}
                    maxLength={9}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  {(roomTitle || branding?.name) && (
                    <div className="mt-3 flex items-center gap-2.5 text-left">
                      {branding?.logoUrl && (
                        <img
                          src={branding.logoUrl}
                          alt=""
                          className="w-8 h-8 rounded-lg object-contain border border-gray-100 bg-white"
                        />
                      )}
                      <div className="min-w-0">
                        {branding?.name && (
                          <p className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color: accent || '#4f46e5' }}>
                            {branding.name}
                          </p>
                        )}
                        {roomTitle && (
                          <p className="text-sm font-semibold text-gray-900 truncate">{roomTitle}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 text-left">
                    {t('join.name')}
                    {allowAnonymous && (
                      <span className="normal-case tracking-normal font-medium text-gray-400">
                        {' '}
                        — {t('join.nameOptional')}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required={!allowAnonymous}
                    className="w-full px-5 py-4 text-base rounded-2xl border-2 border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
                    placeholder={
                      allowAnonymous
                        ? t('join.namePlaceholder')
                        : t('join.nameRequiredPlaceholder') || 'Your name (required)'
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={25}
                    style={
                      accent
                        ? ({ ['--tw-ring-color' as string]: brandTint(accent, 0.35) } as React.CSSProperties)
                        : undefined
                    }
                  />
                </div>

                {passcodeRequired && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 text-left">
                      Passcode
                    </label>
                    <input
                      type="text"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Shown by your host"
                      maxLength={40}
                      autoComplete="off"
                      className="w-full px-5 py-4 text-base rounded-2xl border-2 border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                )}

                <div className="flex justify-center pt-1">
                  <LanguagePicker />
                </div>

                <button
                  type="submit"
                  disabled={loading || normalizeRoomCode(roomCode).length < 4}
                  className="w-full gradient-btn text-white text-base font-semibold py-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group mt-2 shadow-md"
                  style={accent ? { background: accent } : undefined}
                >
                  <span>{loading ? t('join.connecting') : t('join.submit')}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section id="features" className="py-24 px-6 md:px-12 bg-white border-y border-gray-100 relative">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
              Designed for High Engagement
            </span>
            <h2 className="font-heading text-4xl md:text-5xl font-bold text-gray-900">
              Every element crafted with{' '}
              <span className="gradient-text">intention</span>.
            </h2>
            <p className="text-gray-600 text-base leading-relaxed">
              Remove friction between speakers and participants with stunning visuals and instant real-time synchronization.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 rounded-3xl p-8 border border-gray-100 shadow-sm space-y-5 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-gray-900">
                Instant Syncing
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Powered by WebSockets for zero latency. Answers, timers, and leaderboard positions update live across hundreds of connected devices.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 rounded-3xl p-8 border border-gray-100 shadow-sm space-y-5 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-gray-900">
                Real-Time Analytics
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Observe live participant response breakdowns as they submit. Host control options allow you to reveal solutions or pause timer instantly.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 rounded-3xl p-8 border border-gray-100 shadow-sm space-y-5 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-gray-900">
                Premium Design
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                A clean, modern interface with smooth micro-animations, fast interactions, and vibrant accents eliminates distraction.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="how-it-works" className="py-24 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
              Simple Three-Step Process
            </span>
            <h2 className="font-heading text-4xl font-bold text-gray-900 mt-2">
              How QuizPulse Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full gradient-btn text-white font-heading text-2xl font-bold flex items-center justify-center shadow-md">
                1
              </div>
              <h3 className="font-heading text-xl font-bold text-gray-900">Create & Schedule</h3>
              <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
                Build your questions, set answer timers, and get a unique numeric join code in seconds.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full gradient-btn text-white font-heading text-2xl font-bold flex items-center justify-center shadow-md">
                2
              </div>
              <h3 className="font-heading text-xl font-bold text-gray-900">Share Room Code</h3>
              <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
                Display the room PIN on screen. Audience members join instantly on mobile or desktop without downloads.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full gradient-btn text-white font-heading text-2xl font-bold flex items-center justify-center shadow-md">
                3
              </div>
              <h3 className="font-heading text-xl font-bold text-gray-900">Host & Engage</h3>
              <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
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
