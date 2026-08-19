import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Award, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { socket } from '../socket/socket';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const LiveQuiz: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const [participantName, setParticipantName] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [currentSelection, setCurrentSelection] = useState<number | null>(null);
  const [quizEnded, setQuizEnded] = useState(false);

  useEffect(() => {
    const pName = localStorage.getItem('participantName');
    const pId = localStorage.getItem('participantId');
    const eId = localStorage.getItem('eventId');

    if (!pName || !pId || !eId) {
      navigate('/');
      return;
    }

    setParticipantName(pName);
    setParticipantId(pId);
    setEventId(eId);

    // Connect Socket
    socket.connect();
    socket.emit('participant:join', eId, pId);

    // Socket Listeners
    socket.on('participant:questionActive', ({ question, selectedOption }) => {
      setCurrentSelection(selectedOption !== undefined ? selectedOption : null);
      setActiveQuestion(question);
    });

    socket.on('participant:quizEnded', () => {
      setQuizEnded(true);
      setActiveQuestion(null);
    });

    return () => {
      socket.off('participant:questionActive');
      socket.off('participant:quizEnded');
      socket.disconnect();
    };
  }, [navigate]);

  const submitAnswer = async (index: number) => {
    if (!activeQuestion) return;

    setCurrentSelection(index);

    try {
      await api.post('/participants/response', {
        participantId,
        questionId: activeQuestion.id,
        selectedOption: index,
      });
      socket.emit('participant:submitAnswer', eventId);
    } catch (error) {
      console.error('Failed to submit response', error);
      toast.error('Unable to save response. The question may have been closed by the host.');
    }
  };

  if (quizEnded) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] text-[#F1F5F9] flex flex-col items-center justify-center p-6 font-sans relative selection:bg-[#8B5CF6]/30">
        {/* Ambient orbs */}
        <div className="orb orb-violet w-[300px] h-[300px] top-1/4 left-1/4 opacity-20" />
        <div className="orb orb-coral w-[200px] h-[200px] bottom-1/4 right-1/4 opacity-15" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full bg-[#111827] rounded-3xl p-10 text-center shadow-card border border-[#8B5CF6]/15 space-y-6 relative z-10 gradient-border"
        >
          <div className="w-16 h-16 rounded-full bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center mx-auto shadow-glow-sm">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[11px] font-semibold tracking-[0.2em] text-[#8B5CF6] uppercase">
              Session Concluded
            </span>
            <h1 className="font-heading text-4xl font-bold text-white mt-1">
              Quiz Completed!
            </h1>
            <p className="text-sm text-[#64748B] mt-2">
              Thank you for participating, <span className="font-semibold text-white">{participantName}</span>. Your responses were recorded.
            </p>
          </div>

          <div className="pt-4">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl gradient-btn text-white font-medium text-sm transition-all shadow-glow-sm hover:shadow-glow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Home</span>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#F1F5F9] flex flex-col items-center justify-center p-6 font-sans relative selection:bg-[#8B5CF6]/30">
      {/* Ambient glow */}
      <div className="orb orb-violet w-[300px] h-[300px] top-0 right-0 opacity-15" />

      {/* Participant Top Header */}
      <div className="fixed top-6 left-6 right-6 max-w-xl mx-auto flex items-center justify-between px-6 py-3 rounded-2xl bg-[#111827]/80 backdrop-blur-xl border border-[#8B5CF6]/10 shadow-card z-20">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="font-heading font-bold text-sm text-white">QuizPulse</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#64748B]">
            Player: <strong className="text-white">{participantName}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#8B5CF6]/10 text-[#A78BFA] font-mono font-bold border border-[#8B5CF6]/20">
            {roomCode}
          </span>
        </div>
      </div>

      <main className="max-w-xl w-full pt-16 relative z-10">
        <AnimatePresence mode="wait">
          {!activeQuestion ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-[#111827] rounded-3xl p-10 text-center shadow-card border border-[#8B5CF6]/15 space-y-6 gradient-border"
            >
              <div className="w-16 h-16 rounded-full bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-semibold tracking-[0.2em] text-[#8B5CF6] uppercase">
                  Connected & Ready
                </span>
                <h1 className="font-heading text-3xl md:text-4xl font-bold text-white">
                  You're in, {participantName}!
                </h1>
                <p className="text-sm text-[#64748B] max-w-sm mx-auto">
                  Waiting for the host to present the next question...
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={activeQuestion.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-[#111827] rounded-3xl p-8 md:p-10 shadow-card border border-[#8B5CF6]/15 space-y-6"
            >
              <div>
                <span className="text-[11px] font-semibold tracking-[0.2em] text-[#8B5CF6] uppercase">
                  Active Question
                </span>
                <h2 className="font-heading text-3xl font-bold text-white mt-1 leading-snug">
                  {activeQuestion.text}
                </h2>
              </div>

              {/* Options List */}
              <div className="space-y-3.5 pt-2">
                {activeQuestion.options.map((opt: string, idx: number) => {
                  const isSelected = currentSelection === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => submitAnswer(idx)}
                      className={`w-full p-4.5 rounded-2xl text-left font-medium text-base transition-all flex items-center justify-between border ${
                        isSelected
                          ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/40 text-white shadow-glow-sm font-semibold'
                          : 'bg-[#0B0F1A] border-[#1E293B] text-[#94A3B8] hover:border-[#334155] hover:bg-[#1E293B]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span
                          className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-[#8B5CF6] text-white' : 'bg-[#1E293B] text-[#64748B]'
                          }`}
                        >
                          {['A', 'B', 'C', 'D'][idx]}
                        </span>
                        <span>{opt}</span>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-[#8B5CF6]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {currentSelection !== null && (
                <div className="pt-2 text-center">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#A78BFA] bg-[#8B5CF6]/10 px-4 py-2 rounded-full border border-[#8B5CF6]/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Response recorded — You may update until host advances</span>
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default LiveQuiz;
