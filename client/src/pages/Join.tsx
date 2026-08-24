import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { getSessionKey } from '../utils/session';
import LanguagePicker from '../components/LanguagePicker';
import { useTranslation } from '../i18n/useTranslation';
import { normalizeRoomCode } from '../utils/roomCode';
import { themeFor, type ThemeMode } from '../utils/sessionTheme';
import { writeRoomBranding, type RoomBranding } from '../utils/branding';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ArrowRight, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

const Join: React.FC = () => {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [roomTheme, setRoomTheme] = useState<ThemeMode>('discussion');
  const [branding, setBranding] = useState<RoomBranding | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();

  const loadPublicInfo = async (rawCode: string) => {
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) {
      setRoomTitle(null);
      setBranding(null);
      setRoomTheme('discussion');
      setPasscodeRequired(false);
      return;
    }

    try {
      const res = await api.get(`/events/public/${code}`);
      setRoomTitle(res.data.title || null);
      setPasscodeRequired(Boolean(res.data.passcodeRequired));
      setBranding(res.data.branding || null);
      setRoomTheme(themeFor(res.data));
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

    if (!name.trim()) {
      setError(t('join.errorName'));
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

  // A participant who arrived with a code in the link is here to join, not to
  // read a landing page. Kahoot's join screen is one input for exactly this
  // reason, so the marketing collapses away the moment we know the room.
  const focused = Boolean(roomTitle);
  const codeReady = normalizeRoomCode(roomCode).length >= 4;

  return (
    <div
      data-mode={roomTheme}
      className="min-h-screen text-ink flex flex-col font-sans relative"
      style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
    >
      <Navbar />

      <main className="flex-1 flex flex-col">
        <section className="relative flex-1 flex items-center justify-center px-5 pt-28 pb-16 bg-ambient-glow">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 0.82, 0.24, 1] }}
            className="w-full max-w-[460px]"
          >
            {/* The room announces itself the moment the code resolves — the
                host's name and colour, before anyone is admitted. */}
            <div className="text-center mb-7 min-h-[74px] flex flex-col justify-end">
              {focused ? (
                <div key="room" className="animate-cut-in">
                  {branding?.logoUrl && (
                    <img
                      src={branding.logoUrl}
                      alt=""
                      className="h-9 mx-auto mb-3 object-contain"
                    />
                  )}
                  <p className="eyebrow mb-1.5">
                    {branding?.name || t('join.eyebrow')}
                  </p>
                  <h1 className="font-heading text-3xl md:text-[2.1rem] font-bold leading-tight text-ink">
                    {roomTitle}
                  </h1>
                </div>
              ) : (
                <div key="idle">
                  <p className="eyebrow mb-1.5">{t('join.eyebrow')}</p>
                  <h1 className="font-heading text-3xl md:text-[2.1rem] font-bold leading-tight text-ink">
                    {t('join.title')}
                  </h1>
                  <p className="text-[15px] text-muted mt-2">{t('join.subtitle')}</p>
                </div>
              )}
            </div>

            <form onSubmit={handleJoin} className="card card-live p-6 md:p-7 space-y-5 shadow-lg">
              {error && (
                <div
                  role="alert"
                  className="animate-wrong rounded-xl border border-[color:var(--color-wrong)]/25 bg-[color:var(--color-wrong-wash)] px-4 py-3 text-sm font-medium text-[color:var(--color-wrong)] text-center"
                >
                  {error}
                </div>
              )}

              {/* The one thing this screen is for. Everything else is smaller. */}
              <div>
                <label
                  htmlFor="room-code"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-faint mb-2"
                >
                  {t('join.code')}
                </label>
                <input
                  id="room-code"
                  type="text"
                  required
                  value={roomCode}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9A-Za-z ]/g, '').toUpperCase();
                    setRoomCode(next);
                    void loadPublicInfo(next);
                  }}
                  maxLength={9}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123 4567"
                  className="field code-display w-full px-5 py-5 text-center text-[2rem] md:text-[2.4rem] leading-none bg-sunken"
                />
              </div>

              {/* Only asked for once the room says it wants one. */}
              {passcodeRequired && (
                <div className="animate-rise">
                  <label
                    htmlFor="room-passcode"
                    className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-faint mb-2"
                  >
                    Passcode
                  </label>
                  <input
                    id="room-passcode"
                    type="text"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Shown by your host"
                    maxLength={40}
                    autoComplete="off"
                    className="field w-full px-4 py-3.5 text-base"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="participant-name"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-faint mb-2"
                >
                  {t('join.name')}
                </label>
                <input
                  id="participant-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder={t('join.nameRequiredPlaceholder')}
                  className="field w-full px-4 py-3.5 text-base"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !codeReady || !name.trim()}
                className="btn-primary w-full py-4 rounded-xl text-[15px] flex items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{loading ? t('join.connecting') : t('join.submit')}</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>

              <div className="flex items-center justify-center pt-0.5">
                <LanguagePicker />
              </div>
            </form>
          </motion.div>
        </section>

        {/* Marketing lives below the join, and disappears entirely once a real
            room is on screen — nobody arriving mid-meeting needs the pitch. */}
        {!focused && (
          <section className="border-t border-line bg-surface px-5 py-16">
            <div className="max-w-4xl mx-auto">
              <p className="eyebrow text-center mb-3">Built for live rooms</p>
              <h2 className="font-heading text-2xl md:text-3xl font-bold text-center text-ink mb-10 max-w-xl mx-auto">
                Polls, quizzes and audience questions — in the language the room speaks.
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger">
                {[
                  {
                    icon: <Zap className="w-4 h-4" />,
                    title: 'Answers that survive bad wifi',
                    body: 'Tap on a dropped connection and the answer waits, then sends itself when the signal comes back.',
                  },
                  {
                    icon: <BarChart3 className="w-4 h-4" />,
                    title: 'Discussion or game',
                    body: 'Run it calm with Q&A and no scores, or as a timed race with a podium. Or mix the two.',
                  },
                  {
                    icon: <ShieldCheck className="w-4 h-4" />,
                    title: 'Join without an account',
                    body: 'A code is enough. Names are optional, so people say what they actually think.',
                  },
                ].map((feature) => (
                  <div key={feature.title} className="card p-5 hover-card">
                    <span className="inline-flex w-9 h-9 rounded-lg bg-accent-wash text-accent items-center justify-center mb-3">
                      {feature.icon}
                    </span>
                    <h3 className="font-heading text-[15px] font-semibold text-ink mb-1.5">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">{feature.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Join;
