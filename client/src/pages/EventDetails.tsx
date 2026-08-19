import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ArrowLeft, Plus, Edit2, Trash2, Play, Clock, Download, CheckCircle, HelpCircle, Settings, Eraser } from 'lucide-react';
import QuestionForm from '../components/QuestionForm';
import ConcludeSettingsModal from '../components/ConcludeSettingsModal';
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
      <div className="min-h-screen bg-[#FFFFFF] text-[#0F172A] flex items-center justify-center font-serif text-lg italic">
        Loading event details...
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#0F172A] flex flex-col font-sans relative selection:bg-[#E0F2FE]">
      <Navbar />

      <main className="flex-1 pt-32 pb-24 px-6 md:px-12 max-w-5xl mx-auto w-full">
        {/* Back Button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#475569] hover:text-[#0F172A] mb-8 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </button>

        {/* Event Header Banner Card */}
        <div className="bg-[#FFFFFF] rounded-3xl p-8 md:p-10 shadow-lux border border-[#E0F2FE] mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#06B6D4]">
                Event Studio
              </span>
              <span className="px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E0F2FE] text-xs font-mono font-bold text-[#0F172A]">
                PIN: {event.roomCode}
              </span>
            </div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#0F172A]">
              {event.title}
            </h1>
            <p className="text-sm text-[#475569] leading-relaxed">
              Share the PIN code <span className="font-mono font-bold text-[#0F172A] bg-[#FFFFFF] px-2 py-0.5 rounded-md border border-[#E0F2FE]">{event.roomCode}</span> with your participants to join live.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 min-w-[220px]">
            <button
              onClick={() => navigate(`/host/live/${id}`)}
              className="bg-[#F97316] hover:bg-[#EA580C] text-[#FFFFFF] px-6 py-4 rounded-2xl font-medium text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2.5 group"
            >
              <Play className="w-4 h-4 text-[#06B6D4] fill-[#06B6D4] group-hover:scale-110 transition-transform" />
              <span>Broadcast Live Quiz</span>
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
              className="bg-[#F0F9FF] hover:bg-[#E0F2FE] text-[#334155] px-6 py-3 rounded-2xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-[#E0F2FE]"
            >
              <Download className="w-3.5 h-3.5 text-[#06B6D4]" />
              <span>Export CSV Report</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="bg-[#FFFFFF] border border-[#E0F2FE] text-[#0F172A] hover:bg-[#F8FAFC] px-6 py-3 rounded-2xl font-medium text-xs transition-all flex items-center justify-center gap-2 group"
            >
              <Settings className="w-3.5 h-3.5 text-[#475569] group-hover:rotate-45 transition-transform duration-300" />
              <span>Customize Results UI</span>
            </button>
            <button
              onClick={() => setClearDataModal(true)}
              className="bg-[#FEF2F2] border border-[#FEE2E2] text-[#B91C1C] hover:bg-[#FEE2E2] px-6 py-3 rounded-2xl font-medium text-xs transition-all flex items-center justify-center gap-2 group"
            >
              <Eraser className="w-3.5 h-3.5 text-[#DC2626] group-hover:rotate-12 transition-transform duration-300" />
              <span>Clear Participants Data</span>
            </button>
          </div>
        </div>

        {/* Questions Header & Add Button */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E0F2FE]">
          <div>
            <h2 className="font-serif text-3xl font-bold text-[#0F172A]">
              Questions & Polls ({event.questions.length})
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Draft questions to be presented sequentially during the live session
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="bg-[#06B6D4] hover:bg-[#0891B2] text-[#FFFFFF] px-5 py-3 rounded-2xl font-medium text-sm transition-all shadow-xs flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </button>
        </div>

        {/* Questions List */}
        {event.questions.length === 0 ? (
          <div className="text-center bg-[#FFFFFF] rounded-3xl border border-[#E0F2FE] p-16 space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#F0F9FF] flex items-center justify-center text-[#06B6D4] mx-auto">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-2xl font-semibold text-[#0F172A]">No questions added yet</h3>
            <p className="text-sm text-[#475569] max-w-md mx-auto">
              Add your first multiple-choice question or poll prompt to start your quiz collection.
            </p>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#06B6D4] hover:underline pt-2"
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
                  className="bg-[#FFFFFF] rounded-3xl border border-[#E0F2FE] p-7 shadow-lux flex flex-col md:flex-row gap-6 justify-between items-start"
                >
                  <div className="flex-1 space-y-4">
                    {/* Header: Question Number & Title */}
                    <div className="flex items-start gap-4">
                      <span className="w-8 h-8 rounded-full bg-[#F97316] text-[#FFFFFF] text-xs font-serif font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        Q{index + 1}
                      </span>
                      <div className="space-y-1">
                        <h3 className="font-serif text-2xl font-bold text-[#0F172A] leading-snug">
                          {q.text}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-[#475569]">
                          <Clock className="w-3.5 h-3.5 text-[#06B6D4]" />
                          <span>{q.timeLimit > 0 ? `${q.timeLimit} seconds timer` : 'Manual advance (No timer)'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {q.options.map((opt: string, optIdx: number) => {
                        const isCorrect = q.correctOption === optIdx;
                        return (
                          <div
                            key={optIdx}
                            className={`p-3.5 rounded-2xl border text-sm transition-all flex items-center gap-3 ${
                              isCorrect
                                ? 'bg-[#ECFEFF] border-[#06B6D4] text-[#0F172A] font-semibold shadow-xs'
                                : 'bg-[#FFFFFF] border-[#E0F2FE] text-[#334155]'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                              isCorrect ? 'bg-[#06B6D4] text-white' : 'bg-[#E0F2FE] text-[#475569]'
                            }`}>
                              {['A', 'B', 'C', 'D'][optIdx]}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && (
                              <CheckCircle className="w-4 h-4 text-[#06B6D4]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Question Controls */}
                  <div className="flex md:flex-col gap-2 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-[#E0F2FE] md:pl-6 w-full md:w-auto justify-end">
                    <button
                      onClick={() => openEditModal(q)}
                      className="p-3 rounded-2xl bg-[#FFFFFF] hover:bg-[#F0F9FF] text-[#475569] hover:text-[#0F172A] border border-[#E0F2FE] transition-colors"
                      title="Edit Question"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-3 rounded-2xl bg-[#FFFFFF] hover:bg-rose-50 text-[#475569] hover:text-rose-600 border border-[#E0F2FE] hover:border-rose-200 transition-colors"
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
      </main>

      <Footer />

      {isModalOpen && (
        <QuestionForm
          initialData={editingQuestion}
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
