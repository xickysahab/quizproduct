import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Square, ChevronRight, ChevronLeft, Users, BarChart3, Radio, Award, LogOut, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import { QUIZPULSE_PRESET } from '../constants/presets';
import { socket } from '../socket/socket';
import api from '../services/api';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';

const HostLive: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, action: 'conclude' | 'exit' | null}>({ isOpen: false, action: null });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [participantCount, setParticipantCount] = useState(0);
  const [responsesCount, setResponsesCount] = useState(0);

  const [showFinalSummary, setShowFinalSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

  const fetchEventDetails = async () => {
    try {
      const response = await api.get(`/events/${id}`);
      setEvent(response.data.event);
      setParticipantCount(response.data.event._count?.participants || 0);

      // Connect socket
      socket.connect();
      socket.emit('host:join', id);

      // Setup socket listeners
      socket.on('host:participantJoined', () => {
        setParticipantCount((prev) => prev + 1);
      });

      socket.on('host:newResponseBatch', (data: { count: number }) => {
        setResponsesCount((prev) => prev + data.count);
      });
    } catch (error) {
      console.error('Failed to fetch event', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      socket.off('host:participantJoined');
      socket.off('host:newResponseBatch');
      socket.disconnect();
    };
  }, []);

  const handleNextQuestion = () => {
    if (!event) return;
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < event.questions.length) {
      setCurrentQuestionIndex(nextIndex);
      setResponsesCount(0);
      socket.emit('host:nextQuestion', id, event.questions[nextIndex]);
    }
  };

  const handlePrevQuestion = () => {
    if (!event || currentQuestionIndex <= 0) return;
    const prevIndex = currentQuestionIndex - 1;
    setCurrentQuestionIndex(prevIndex);
    setResponsesCount(0);
    socket.emit('host:nextQuestion', id, event.questions[prevIndex]);
  };

  const handleFinishAndViewSummary = async () => {
    setConfirmModal({ isOpen: true, action: 'conclude' });
  };

  const executeConclude = async () => {
    socket.emit('host:endQuiz', id);

    try {
      const res = await api.get(`/analytics/events/${id}/summary`);
      setSummaryData(res.data);
      setShowFinalSummary(true);
    } catch (err) {
      console.error('Failed to load summary analytics', err);
      toast.error('Failed to load results summary.');
    }
  };

  const handleEndQuiz = () => {
    if (!showFinalSummary) {
      setConfirmModal({ isOpen: true, action: 'exit' });
      return;
    }
    executeExit();
  };

  const executeExit = () => {
    if (!showFinalSummary) socket.emit('host:endQuiz', id);
    navigate(`/dashboard`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] text-white flex items-center justify-center font-heading text-lg">
        Initializing live broadcast stage...
      </div>
    );
  }

  if (!event || !event.questions || event.questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="font-heading text-2xl">No questions configured for this event.</p>
        <button
          onClick={() => navigate(`/events/${id}`)}
          className="px-6 py-3 rounded-2xl gradient-btn text-white font-medium shadow-glow-sm"
        >
          Add Questions First
        </button>
      </div>
    );
  }

  const activeQuestion = currentQuestionIndex >= 0 ? event.questions[currentQuestionIndex] : null;
  const isFinished = currentQuestionIndex >= event.questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F1A] text-[#F1F5F9] font-sans relative selection:bg-[#8B5CF6]/30">
      {/* Header Bar */}
      <header className="bg-[#111827] px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-[#8B5CF6]/10 shadow-sm">
        <div className="flex items-center gap-4">
          <Logo size={36} />
          <div>
            <h1 className="font-heading text-xl font-bold text-white">{event.title}</h1>
            <div className="flex items-center gap-3 text-xs text-[#64748B]">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>{participantCount} Joined</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#10B981] animate-pulse" />
                <span>Live Broadcast</span>
              </span>
            </div>
          </div>
        </div>

        {/* PIN Badge */}
        <div className="text-right flex items-center gap-4">
          <div className="bg-[#0B0F1A] px-5 py-2 rounded-2xl border border-[#8B5CF6]/20 text-center">
            <span className="text-[10px] tracking-[0.2em] uppercase text-[#8B5CF6] font-semibold block">
              Join Code
            </span>
            <span className="font-mono text-3xl font-bold tracking-[0.2em] text-white">
              {event.roomCode}
            </span>
          </div>
        </div>
      </header>

      {/* Stage Main View */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 text-center w-full flex items-center justify-center">
        <div className="max-w-4xl mx-auto w-full h-full flex items-center justify-center">
          {showFinalSummary && summaryData ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-left w-full"
            >
              <div className="w-full space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between bg-[#111827] p-6 rounded-3xl border border-[#8B5CF6]/10 shadow-card">
                  <h3 className="font-heading text-2xl md:text-3xl font-bold text-white">
                    Overall Audience Sentiment
                  </h3>
                  <div className="mt-4 md:mt-0 flex items-center gap-3">
                    <span className="text-sm font-semibold uppercase tracking-wider text-[#64748B]">Total Participants:</span>
                    <span className="text-lg font-bold text-[#8B5CF6] bg-[#8B5CF6]/10 px-4 py-1.5 rounded-full">
                      {summaryData.totalParticipants}
                    </span>
                  </div>
                </div>

                <div className="mt-8">
                  {(() => {
                    const activeConfig = event?.concludeConfig || QUIZPULSE_PRESET;
                    const activeChartType = activeConfig.chartType || 'CUSTOM_GRID';
                    const activeOptions = activeConfig.options || [];

                    if (activeChartType === 'BAR_CHART') {
                      return (
                        <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto p-8 rounded-3xl border border-[#1E293B] shadow-card bg-[#111827]">
                          {activeOptions.map((opt: any, idx: number) => {
                            const pct = summaryData.collective?.percentages?.[idx] || 0;
                            const count = summaryData.collective?.optionCounts?.[idx] || 0;
                            return (
                              <div key={idx} className="flex flex-col gap-3">
                                <div className="flex justify-between items-end">
                                  <div>
                                    <div className="text-lg font-bold text-white flex items-center gap-2">
                                      <span className="w-6 h-6 rounded flex items-center justify-center text-xs text-white" style={{ backgroundColor: opt.themeColor }}>{opt.letter}</span>
                                      {opt.text}
                                    </div>
                                    <div className="text-xs font-bold tracking-wider mt-1" style={{ color: opt.themeColor }}>{opt.alert}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-2xl font-black" style={{ color: opt.themeColor }}>{pct}%</div>
                                    <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">{count} votes</div>
                                  </div>
                                </div>
                                <div className="h-8 w-full rounded-xl overflow-hidden bg-[#1E293B] flex items-center">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, delay: idx * 0.1 }} className="h-full rounded-xl flex items-center justify-end px-4" style={{ backgroundColor: opt.themeColor }}>
                                      <span className="text-xs font-bold text-white drop-shadow-sm">{pct > 5 ? `${pct}%` : ''}</span>
                                  </motion.div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    if (activeChartType === 'PIE_CHART') {
                      let cumulativePercent = 0;
                      const gradientStops = activeOptions.map((opt: any, idx: number) => {
                        const pct = summaryData.collective?.percentages?.[idx] || 0;
                        const start = cumulativePercent;
                        cumulativePercent += pct;
                        return `${opt.themeColor} ${start}% ${cumulativePercent}%`;
                      });
                      
                      const conicGradient = cumulativePercent > 0 ? `conic-gradient(${gradientStops.join(', ')})` : 'conic-gradient(#1E293B 0% 100%)';

                      return (
                        <div className="flex flex-col md:flex-row items-center justify-center gap-12 p-8 md:p-16 rounded-3xl border border-[#1E293B] shadow-card bg-[#111827]">
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8 }}
                            className="w-64 h-64 md:w-80 md:h-80 rounded-full shadow-inner relative flex items-center justify-center" 
                            style={{ background: conicGradient }}
                          >
                            <div className="w-1/2 h-1/2 bg-[#111827] rounded-full shadow-2xl flex items-center justify-center flex-col z-10">
                              <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Total</span>
                              <span className="text-4xl font-black text-white">{summaryData.totalParticipants}</span>
                            </div>
                          </motion.div>
                          
                          <div className="flex flex-col gap-6 w-full max-w-sm">
                            {activeOptions.map((opt: any, idx: number) => {
                                const pct = summaryData.collective?.percentages?.[idx] || 0;
                                const count = summaryData.collective?.optionCounts?.[idx] || 0;
                                return (
                                  <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: idx * 0.1 }} key={idx} className="flex items-start gap-4 p-4 rounded-2xl transition-colors hover:bg-[#1E293B] border border-transparent hover:border-[#334155]">
                                    <div className="w-6 h-6 rounded-full shadow-md flex-shrink-0 mt-1" style={{ backgroundColor: opt.themeColor }}></div>
                                    <div className="flex-1">
                                      <div className="flex justify-between items-center mb-1">
                                        <div className="text-sm font-bold text-white flex items-center gap-2">Option {opt.letter} <span className="px-2 py-0.5 rounded text-[9px] uppercase tracking-wider text-white" style={{ backgroundColor: opt.themeColor }}>{opt.alert}</span></div>
                                        <div className="text-sm font-black" style={{ color: opt.themeColor }}>{pct}%</div>
                                      </div>
                                      <div className="text-xs text-[#64748B] font-medium">{opt.text}</div>
                                      <div className="text-[10px] text-[#475569] mt-1">{count} votes</div>
                                    </div>
                                  </motion.div>
                                );
                            })}
                          </div>
                        </div>
                      );
                    }

                    // Default to CUSTOM_GRID
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeOptions.map((opt: any, idx: number) => {
                          const pct = summaryData.collective?.percentages?.[idx] || 0;
                          const count = summaryData.collective?.optionCounts?.[idx] || 0;

                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="relative overflow-hidden p-6 md:p-8 rounded-3xl border shadow-card transition-transform hover:-translate-y-1"
                              style={{ backgroundColor: `${opt.themeColor}15`, borderColor: `${opt.themeColor}33` }}
                            >
                              <div className="flex justify-between items-start mb-8">
                                <div 
                                  className="px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest"
                                  style={{ backgroundColor: '#111827', color: opt.themeColor, borderColor: `${opt.themeColor}4D` }}
                                >
                                  Option {opt.letter}
                                </div>
                                <div className="text-right" style={{ color: opt.themeColor }}>
                                  <span className="text-4xl md:text-5xl font-bold block">{pct}%</span>
                                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{count} votes</span>
                                </div>
                              </div>
                              
                              <h4 className="text-xl md:text-2xl font-heading italic font-medium mb-4 leading-snug" style={{ color: opt.themeColor }}>
                                {opt.text}
                              </h4>

                              <div 
                                className="inline-block px-3 py-1 mb-8 rounded text-[10px] font-bold tracking-[0.15em] shadow-sm text-white"
                                style={{ backgroundColor: opt.themeColor }}
                              >
                                {opt.alert}
                              </div>

                              <div className="h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: `${opt.themeColor}33` }}>
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 + (idx * 0.1) }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: opt.themeColor }}
                                />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          ) : currentQuestionIndex === -1 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 text-center"
            >
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8B5CF6]">
                  Lobby Stage
                </span>
                <h2 className="font-heading text-4xl md:text-6xl font-bold text-white">
                  Waiting for participants to join...
                </h2>
                
                {!showQR ? (
                  <div className="flex flex-col items-center gap-4 mt-4">
                    <p className="text-base text-[#64748B] max-w-lg mx-auto font-light">
                      Ask your audience to go to the landing page and enter room PIN{' '}
                      <span className="font-mono font-bold text-white bg-[#1E293B] px-2 py-0.5 rounded-md border border-[#8B5CF6]/20">
                        {event.roomCode}
                      </span>
                    </p>
                    <button
                      onClick={() => setShowQR(true)}
                      className="text-sm font-semibold text-[#A78BFA] flex items-center gap-2 hover:text-white transition-colors bg-[#8B5CF6]/10 px-4 py-2 rounded-full border border-[#8B5CF6]/20"
                    >
                      <QrCode className="w-4 h-4" />
                      Show QR Code
                    </button>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4 mt-6 bg-[#111827] p-6 rounded-3xl border border-[#8B5CF6]/15 shadow-card max-w-xs mx-auto relative"
                  >
                    <button
                      onClick={() => setShowQR(false)}
                      className="absolute top-4 right-4 text-[#64748B] hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-bold uppercase tracking-widest text-[#8B5CF6]">Scan to Join</span>
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                      <QRCodeSVG 
                        value={`${window.location.origin}/?code=${event.roomCode}`} 
                        size={180}
                        fgColor="#0B0F1A"
                        level="H"
                      />
                    </div>
                    <span className="font-mono text-2xl font-bold tracking-[0.2em] text-white">
                      {event.roomCode}
                    </span>
                  </motion.div>
                )}
              </div>

              <div className="pt-4">
                <button
                  onClick={handleNextQuestion}
                  className="px-10 py-5 rounded-2xl gradient-btn text-white font-heading text-2xl font-bold transition-all shadow-glow-md hover:shadow-glow-lg hover:scale-105 inline-flex items-center gap-3"
                >
                  <Play className="w-6 h-6 fill-current text-white" />
                  <span>Begin Quiz Broadcast</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 text-left"
            >
              {/* Question Index & Live Response Count */}
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-4">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
                  Question {currentQuestionIndex + 1} of {event.questions.length}
                </span>

                <div className="flex items-center gap-2 bg-[#1E293B] px-4 py-2 rounded-full border border-[#8B5CF6]/15 text-xs font-medium text-white">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                  <span>
                    {responsesCount} / {participantCount} Submissions
                  </span>
                </div>
              </div>

              {/* Title */}
              <h2 className="font-heading text-4xl md:text-5xl font-bold text-white leading-tight">
                {activeQuestion.text}
              </h2>

              {/* Options Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                {activeQuestion.options.map((opt: string, idx: number) => (
                  <div
                    key={idx}
                    className="bg-[#111827] border border-[#1E293B] rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-[#8B5CF6]/40 hover:bg-[#1E293B] shadow-sm hover-glow"
                  >
                    <span className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 text-[#A78BFA] font-heading text-lg font-bold flex items-center justify-center border border-[#8B5CF6]/20">
                      {['A', 'B', 'C', 'D'][idx]}
                    </span>
                    <span className="text-lg font-medium text-white">{opt}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Control Footer */}
      <footer className="bg-[#111827] px-8 py-5 flex justify-between items-center border-t border-[#8B5CF6]/10 shadow-sm">
        <button
          onClick={handleEndQuiz}
          className="px-5 py-2.5 rounded-xl bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-[#FB7185] text-xs font-semibold transition-all flex items-center gap-2 border border-[#F43F5E]/20"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>{showFinalSummary ? 'Exit Cockpit' : 'End Live Quiz'}</span>
        </button>

        {!showFinalSummary && currentQuestionIndex !== -1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevQuestion}
              disabled={currentQuestionIndex === 0}
              className="px-5 py-2.5 rounded-xl bg-[#0B0F1A] hover:bg-[#1E293B] border border-[#1E293B] text-[#94A3B8] text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {isFinished ? (
              <button
                onClick={handleFinishAndViewSummary}
                className="px-7 py-3 rounded-2xl gradient-btn text-white font-semibold text-sm transition-all shadow-glow-sm hover:shadow-glow-md flex items-center gap-2"
              >
              <span>Conclude & Show Results</span>
              <BarChart3 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleNextQuestion}
                className="px-7 py-3 rounded-2xl gradient-btn text-white hover:opacity-90 font-semibold text-sm transition-all shadow-glow-sm hover:shadow-glow-md flex items-center gap-2"
              >
              <span>Next Question</span>
              <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </footer>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.action === 'conclude' ? 'Conclude Quiz' : 'Exit Broadcast'}
        message={
          confirmModal.action === 'conclude'
            ? 'Are you sure you want to conclude the live quiz and display final analytics?'
            : 'Are you sure you want to exit the broadcast?'
        }
        icon={confirmModal.action === 'conclude' ? <Award className="w-7 h-7" /> : <LogOut className="w-7 h-7" />}
        onConfirm={() => {
          if (confirmModal.action === 'conclude') executeConclude();
          else if (confirmModal.action === 'exit') executeExit();
        }}
        onCancel={() => setConfirmModal({ isOpen: false, action: null })}
        isDestructive={confirmModal.action === 'exit'}
      />
    </div>
  );
};

export default HostLive;
