import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Award, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { socket, connectAsParticipant } from '../socket/socket';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const LiveQuiz: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const [participantName, setParticipantName] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [currentSelection, setCurrentSelection] = useState<number | null>(null);
  const [multiSelection, setMultiSelection] = useState<number[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [quizEnded, setQuizEnded] = useState(false);
  const [myResult, setMyResult] = useState<{ score: number; rank: number; totalParticipants: number } | null>(null);

  useEffect(() => {
    const pName = localStorage.getItem('participantName');
    const pId = localStorage.getItem('participantId');
    const eId = localStorage.getItem('eventId');
    const pToken = localStorage.getItem('participantToken');

    // Sessions saved before room tokens existed cannot answer, so send them
    // back to rejoin rather than letting every submission fail.
    if (!pName || !pId || !eId || !pToken) {
      navigate('/');
      return;
    }

    setParticipantName(pName);

    connectAsParticipant();
    socket.emit('participant:join');

    socket.on('participant:questionActive', ({ question, selectedOption }) => {
      setCurrentSelection(selectedOption !== undefined ? selectedOption : null);
      setMultiSelection([]);
      setTextAnswer('');
      setSubmitted(selectedOption !== undefined && selectedOption !== null);
      setActiveQuestion(question);
    });

    socket.on('participant:quizEnded', async () => {
      setQuizEnded(true);
      setActiveQuestion(null);
      try {
        const res = await api.get('/participants/me');
        setMyResult(res.data);
      } catch {
        /* score is optional */
      }
    });

    socket.on('participant:unauthorized', ({ message }) => {
      toast.error(message || 'Session expired. Please rejoin the room.');
      localStorage.removeItem('participantToken');
      navigate('/');
    });

    return () => {
      socket.off('participant:questionActive');
      socket.off('participant:quizEnded');
      socket.off('participant:unauthorized');
      socket.disconnect();
    };
  }, [navigate]);

  const submitAnswer = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!activeQuestion) return false;

    try {
      await api.post('/participants/response', {
        questionId: activeQuestion.id,
        ...payload,
      });
      socket.emit('participant:submitAnswer');
      setSubmitted(true);
      return true;
    } catch (error: any) {
      if (error.response?.status === 401) {
        localStorage.removeItem('participantToken');
        toast.error('Session expired. Please rejoin the room.');
        navigate('/');
        return false;
      }

      toast.error(
        error.response?.data?.message ||
          'Unable to save response. The question may have been closed by the host.'
      );
      return false;
    }
  };

  const submitMcq = async (index: number) => {
    const previousSelection = currentSelection;
    setCurrentSelection(index);
    const ok = await submitAnswer({ selectedOption: index });
    if (!ok) setCurrentSelection(previousSelection);
  };

  if (quizEnded) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-6 font-sans relative selection:bg-indigo-100">
        {/* Ambient orbs */}
        <div className="orb orb-violet w-[300px] h-[300px] top-1/4 left-1/4 opacity-10" />
        <div className="orb orb-coral w-[200px] h-[200px] bottom-1/4 right-1/4 opacity-10" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-200 space-y-6 relative z-10 hover-card"
        >
          <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
              Session Concluded
            </span>
            <h1 className="font-heading text-4xl font-bold text-gray-900 mt-1">
              Quiz Completed!
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Thank you for participating, <span className="font-semibold text-gray-900">{participantName}</span>.
              {myResult
                ? ` You scored ${myResult.score} point${myResult.score === 1 ? '' : 's'} (rank ${myResult.rank} of ${myResult.totalParticipants}).`
                : ' Your responses were recorded.'}
            </p>
          </div>

          <div className="pt-4">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl gradient-btn text-white font-medium text-sm transition-all shadow-sm hover:shadow-md"
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
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-6 font-sans relative selection:bg-indigo-100">
      {/* Ambient glow */}
      <div className="orb orb-violet w-[300px] h-[300px] top-0 right-0 opacity-10" />

      {/* Participant Top Header */}
      <div className="fixed top-6 left-6 right-6 max-w-xl mx-auto flex items-center justify-between px-6 py-3 rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200 shadow-sm z-20">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="font-heading font-bold text-sm text-gray-900">QuizPulse</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">
            Player: <strong className="text-gray-900">{participantName}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-mono font-bold border border-indigo-100">
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
              className="bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-200 space-y-6 hover-card"
            >
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                  Connected & Ready
                </span>
                <h1 className="font-heading text-3xl md:text-4xl font-bold text-gray-900">
                  You're in, {participantName}!
                </h1>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
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
              className="bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-gray-200 space-y-6"
            >
              <div>
                <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                  Active Question
                </span>
                <h2 className="font-heading text-3xl font-bold text-gray-900 mt-1 leading-snug">
                  {activeQuestion.text}
                </h2>
              </div>

              {/* Options List */}
              <div className="space-y-3.5 pt-2">
                {(activeQuestion.type === 'OPEN_TEXT' || activeQuestion.type === 'WORD_CLOUD') && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitAnswer({ answerText: textAnswer });
                    }}
                    className="space-y-3"
                  >
                    <textarea
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      rows={3}
                      maxLength={280}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 outline-none focus:border-indigo-500"
                      placeholder={activeQuestion.type === 'WORD_CLOUD' ? 'Type a word or short phrase' : 'Type your answer'}
                    />
                    <button type="submit" disabled={!textAnswer.trim()} className="w-full gradient-btn text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                      {submitted ? 'Update answer' : 'Submit answer'}
                    </button>
                  </form>
                )}

                {activeQuestion.type === 'MULTI_SELECT' && (
                  <>
                    {(activeQuestion.options || []).map((opt: string, idx: number) => {
                      const isSelected = multiSelection.includes(idx);
                      return (
                        <button
                          key={idx}
                          onClick={() =>
                            setMultiSelection((prev) =>
                              prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                            )
                          }
                          className={`w-full p-4.5 rounded-2xl text-left font-medium text-base transition-all flex items-center justify-between border ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                              : 'bg-white border-gray-200 text-gray-600'
                          }`}
                        >
                          <span>{opt}</span>
                          {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => submitAnswer({ selectedOptions: multiSelection })}
                      disabled={multiSelection.length === 0}
                      className="w-full gradient-btn text-white py-3 rounded-xl font-semibold disabled:opacity-50"
                    >
                      {submitted ? 'Update selection' : 'Submit selection'}
                    </button>
                  </>
                )}

                {(!activeQuestion.type || activeQuestion.type === 'MCQ' || activeQuestion.type === 'RATING') &&
                  (activeQuestion.options || []).map((opt: string, idx: number) => {
                  const isSelected = currentSelection === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => submitMcq(idx)}
                      className={`w-full p-4.5 rounded-2xl text-left font-medium text-base transition-all flex items-center justify-between border ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm font-semibold'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span
                          className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {['A', 'B', 'C', 'D', 'E', 'F'][idx] || idx + 1}
                        </span>
                        <span>{opt}</span>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                      )}
                    </button>
                  );
                })}
              </div>

              {submitted && (
                <div className="pt-2 text-center">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100">
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
