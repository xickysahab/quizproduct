import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ArrowLeft, Plus, Edit2, Trash2, Play, Clock, Download, CheckCircle, HelpCircle, Settings, Eraser } from 'lucide-react';
import QuestionForm from '../components/QuestionForm';
import ConcludeSettingsModal from '../components/ConcludeSettingsModal';
import RoomAccessPanel from '../components/RoomAccessPanel';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';

const EventDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, questionId: string | null}>({ isOpen: false, questionId: null });
  const [clearDataModal, setClearDataModal] = useState(false);

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

  const fetchEventDetails = async () => {
    try {
      const response = await api.get(`/events/${id}`);
      setEvent(response.data.event);
    } catch (error) {
      console.error('Failed to fetch event details', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async (data: any) => {
    await api.post('/questions', { ...data, eventId: id });
    fetchEventDetails();
  };

  const handleEditQuestion = async (data: any) => {
    await api.put(`/questions/${editingQuestion.id}`, data);
    fetchEventDetails();
  };

  const handleSaveConfig = async (config: any) => {
    try {
      await api.put(`/events/${id}/config`, { concludeConfig: config });
      toast.success('Results configuration saved successfully');
      fetchEventDetails();
    } catch (error) {
      console.error('Failed to save config', error);
      toast.error('Failed to save configuration');
    }
  };

  const handleClearData = async () => {
    try {
      await api.delete(`/events/${id}/clear-data`);
      toast.success('Participants data cleared successfully');
      setClearDataModal(false);
      fetchEventDetails();
    } catch (error: any) {
      console.error('Failed to clear data', error);
      toast.error(error.response?.data?.message || 'Failed to clear participants data');
      setClearDataModal(false);
    }
  };

  const handleDeleteQuestion = (questionId: string) => {
    setDeleteModal({ isOpen: true, questionId });
  };

  const executeDelete = async () => {
    if (!deleteModal.questionId) return;
    try {
      await api.delete(`/questions/${deleteModal.questionId}`);
      setDeleteModal({ isOpen: false, questionId: null });
      fetchEventDetails();
    } catch (error) {
      console.error('Failed to delete question', error);
    }
  };

  const openAddModal = () => {
    setEditingQuestion(null);
    setIsModalOpen(true);
  };

  const openEditModal = (q: any) => {
    setEditingQuestion(q);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center font-heading text-lg">
        Loading event details...
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans relative selection:bg-indigo-100">
      <Navbar />

      <main className="flex-1 pt-32 pb-24 px-6 md:px-12 max-w-5xl mx-auto w-full">
        {/* Back Button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900 mb-8 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </button>

        {/* Event Header Banner Card */}
        <div className="bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-gray-200 mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8 hover-card transition-all">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600">
                Event Studio
              </span>
              <span className="px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs font-mono font-bold text-gray-700">
                PIN: {event.roomCode}
              </span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl font-bold text-gray-900">
              {event.title}
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              <span
                className={`inline-flex mr-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border align-middle ${
                  event.sessionMode === 'SURVEY'
                    ? 'bg-teal-50 text-teal-700 border-teal-100'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                }`}
              >
                {event.sessionMode === 'SURVEY' ? 'Survey' : 'Quiz'}
              </span>
              Share the PIN code <span className="font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">{event.roomCode}</span> with your participants to join live.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 min-w-[220px]">
            <button
              onClick={() => navigate(`/host/live/${id}`)}
              className="gradient-btn text-white px-6 py-4 rounded-2xl font-semibold text-sm transition-all shadow-glow-sm hover:shadow-glow-md flex items-center justify-center gap-2.5 group"
            >
              <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              <span>{event.sessionMode === 'SURVEY' ? 'Broadcast Live Survey' : 'Broadcast Live Quiz'}</span>
            </button>

            <button
              onClick={async () => {
                try {
                  const response = await api.get(`/analytics/events/${id}/export`, { responseType: 'blob' });
                  const url = window.URL.createObjectURL(new Blob([response.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}_Analytics.csv`);
                  document.body.appendChild(link);
                  link.click();
                  link.parentNode?.removeChild(link);
                } catch (error: any) {
                  console.error('Download error:', error);
                  toast.error(error.response?.data?.message || 'Failed to download analytics report');
                }
              }}
              className="bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 px-6 py-3 rounded-2xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-gray-200 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Export CSV Report</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="bg-gray-50 border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 px-6 py-3 rounded-2xl font-medium text-xs transition-all flex items-center justify-center gap-2 group shadow-sm"
            >
              <Settings className="w-3.5 h-3.5 text-gray-500 group-hover:rotate-45 transition-transform duration-300" />
              <span>Customize Results UI</span>
            </button>
            <button
              onClick={() => setClearDataModal(true)}
              className="bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 px-6 py-3 rounded-2xl font-medium text-xs transition-all flex items-center justify-center gap-2 group shadow-sm"
            >
              <Eraser className="w-3.5 h-3.5 text-red-500 group-hover:rotate-12 transition-transform duration-300" />
              <span>Clear Participants Data</span>
            </button>
          </div>
        </div>

        <RoomAccessPanel
          eventId={id!}
          passcodeSet={Boolean(event.passcodeSet)}
          allowAnonymous={event.allowAnonymous !== false}
          roomCodeRetiredAt={event.roomCodeRetiredAt ?? null}
          speedBonusEnabled={Boolean(event.speedBonusEnabled)}
          sessionMode={event.sessionMode === 'SURVEY' ? 'SURVEY' : 'QUIZ'}
          onUpdated={fetchEventDetails}
        />

        {/* Questions Header & Add Button */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
          <div>
            <h2 className="font-heading text-3xl font-bold text-gray-900">
              Questions & Polls ({event.questions.length})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Draft questions to be presented sequentially during the live session
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="gradient-btn text-white px-5 py-3 rounded-2xl font-semibold text-sm transition-all shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </button>
        </div>

        {/* Questions List */}
        {event.questions.length === 0 ? (
          <div className="text-center bg-white rounded-3xl border border-gray-200 p-16 space-y-4 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mx-auto">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h3 className="font-heading text-2xl font-bold text-gray-900">No questions added yet</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Add your first multiple-choice question or poll prompt to start your quiz collection.
            </p>
              <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline pt-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Question</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {event.questions.map((q: any, index: number) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="bg-white rounded-3xl border border-gray-200 p-7 shadow-sm flex flex-col md:flex-row gap-6 justify-between items-start hover-card transition-all"
                >
                  <div className="flex-1 space-y-4">
                    {/* Header: Question Number & Title */}
                    <div className="flex items-start gap-4">
                      <span className="w-8 h-8 rounded-full gradient-btn text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        Q{index + 1}
                      </span>
                      <div className="space-y-1">
                        <h3 className="font-heading text-2xl font-bold text-gray-900 leading-snug">
                          {q.text}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold uppercase tracking-wider">
                            {(q.type || 'MCQ').replace('_', ' ')}
                          </span>
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{q.timeLimit > 0 ? `${q.timeLimit} seconds timer` : 'Manual advance (No timer)'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {(q.options || []).map((opt: string, optIdx: number) => {
                        const isCorrect = q.correctOption === optIdx;
                        return (
                          <div
                            key={optIdx}
                            className={`p-3.5 rounded-2xl border text-sm transition-all flex items-center gap-3 ${
                              isCorrect
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold shadow-sm'
                                : 'bg-gray-50 border-gray-200 text-gray-700'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                              isCorrect ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500'
                            }`}>
                              {['A', 'B', 'C', 'D'][optIdx]}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && (
                              <CheckCircle className="w-4 h-4 text-indigo-600" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Question Controls */}
                  <div className="flex md:flex-col gap-2 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-gray-200 md:pl-6 w-full md:w-auto justify-end">
                    <button
                      onClick={() => openEditModal(q)}
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200 transition-colors shadow-sm"
                      title="Edit Question"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-200 transition-colors shadow-sm"
                      title="Delete Question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <EventReports eventId={id!} />
      </main>

      <Footer />

      {isModalOpen && (
        <QuestionForm
          initialData={editingQuestion}
          surveyMode={event.sessionMode === 'SURVEY'}
          onClose={() => setIsModalOpen(false)}
          onSubmit={editingQuestion ? handleEditQuestion : handleAddQuestion}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Question"
        message="Are you sure you want to delete this question? This action cannot be undone."
        confirmText="Delete"
        onConfirm={executeDelete}
        onCancel={() => setDeleteModal({ isOpen: false, questionId: null })}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={clearDataModal}
        title="Clear Participants Data"
        message="Are you sure you want to clear all participant data for this quiz? The quiz itself will remain intact, but all participant responses and records will be permanently deleted."
        confirmText="Clear Data"
        onConfirm={handleClearData}
        onCancel={() => setClearDataModal(false)}
        isDestructive={true}
      />

      <ConcludeSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
        initialConfig={event?.concludeConfig}
      />
    </div>
  );
};

export default EventDetails;

const EventReports: React.FC<{ eventId: string }> = ({ eventId }) => {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get(`/analytics/events/${eventId}/leaderboard`).then((r) => setLeaderboard(r.data.leaderboard || [])).catch(() => undefined),
      api.get(`/analytics/events/${eventId}/participants`).then((r) => setParticipants(r.data.participants || [])).catch(() => undefined),
    ]);
  }, [eventId]);

  if (!leaderboard.length && !participants.length) return null;

  return (
    <div className="mt-12 space-y-6 print:block">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Results</h2>
        <button onClick={() => window.print()} className="text-sm font-semibold text-indigo-600">
          Print / Save PDF
        </button>
      </div>
      {leaderboard.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.slice(0, 20).map((row) => (
                <tr key={row.participantId} className="border-t border-gray-100">
                  <td className="px-4 py-2">{row.rank}</td>
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-right">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {participants.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Participant breakdown</h3>
          {participants.map((p) => (
            <details key={p.id} className="border border-gray-100 rounded-xl p-3">
              <summary className="cursor-pointer font-medium text-sm">
                {p.name} · {p.score} pts
              </summary>
              <ul className="mt-2 text-xs text-gray-600 space-y-1">
                {p.answers.map((a: any) => (
                  <li key={a.questionId}>
                    {a.text}: {a.answer ?? '—'} {a.isCorrect ? '(correct)' : ''}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
};
