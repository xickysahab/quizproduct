import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Plus, Presentation, Users, Trash2, Copy, Check, Search, Radio, ArrowUpRight, UserPlus, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';
import CreateAdminModal from '../components/CreateAdminModal';

interface Event {
  id: string;
  title: string;
  roomCode: string;
  isLive: boolean;
  createdAt: string;
  _count: {
    questions: number;
    participants: number;
  };
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, eventId: string | null}>({ isOpen: false, eventId: null });
  const [newEventTitle, setNewEventTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await api.get('/events');
      setEvents(response.data.events);
    } catch (error) {
      console.error('Failed to fetch events', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    setCreating(true);
    try {
      await api.post('/events', { title: newEventTitle });
      setNewEventTitle('');
      fetchEvents();
    } catch (error) {
      console.error('Failed to create event', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEvent = (id: string) => {
    setDeleteModal({ isOpen: true, eventId: id });
  };

  const executeDelete = async () => {
    if (!deleteModal.eventId) return;
    try {
      await api.delete(`/events/${deleteModal.eventId}`);
      setDeleteModal({ isOpen: false, eventId: null });
      fetchEvents();
    } catch (error) {
      console.error('Failed to delete event', error);
    }
  };

  const copyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredEvents = events.filter(
    (e) =>
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.roomCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalQuestions = events.reduce((acc, curr) => acc + (curr._count?.questions || 0), 0);
  const totalParticipants = events.reduce((acc, curr) => acc + (curr._count?.participants || 0), 0);

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#F1F5F9] flex flex-col font-sans relative selection:bg-[#8B5CF6]/30">
      <Navbar />

      <main className="flex-1 pt-32 pb-24 px-6 md:px-12 max-w-7xl mx-auto w-full">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 pb-8 border-b border-[#8B5CF6]/10">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
              Host Dashboard
            </span>
            <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mt-1">
              Welcome, {user?.name || 'Host'}
            </h1>
            <p className="text-[#64748B] text-sm max-w-xl leading-relaxed">
            Manage your interactive quizzes, live polls, and audience engagement seamlessly.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => setIsAdminModalOpen(true)}
              className="flex items-center gap-2 bg-[#1E293B] hover:bg-[#334155] text-[#A78BFA] px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-[#8B5CF6]/20"
            >
              <UserPlus className="w-4 h-4" />
              Add Sub-Admin
            </button>
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => navigate('/admin/logs')}
                className="flex items-center gap-2 bg-[#1E293B] hover:bg-[#334155] text-[#FB7185] px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-[#F43F5E]/20"
              >
                <FileText className="w-4 h-4" />
                Audit Logs
              </button>
            )}
          </div>
        </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#111827] border border-[#8B5CF6]/20 text-xs font-medium text-[#94A3B8]">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
              <span>Host Status: Active</span>
            </span>
          </div>
        </div>

        {/* Metric Cards Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-[#111827] rounded-3xl p-6 border border-[#8B5CF6]/10 shadow-card space-y-2 hover-glow transition-all">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Quiz Sessions
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-3xl font-bold text-white">{events.length}</span>
              <Presentation className="w-5 h-5 text-[#8B5CF6]" />
            </div>
          </div>

          <div className="bg-[#111827] rounded-3xl p-6 border border-[#F43F5E]/10 shadow-card space-y-2 hover-glow transition-all">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Questions Built
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-3xl font-bold text-white">{totalQuestions}</span>
              <Radio className="w-5 h-5 text-[#F43F5E]" />
            </div>
          </div>

          <div className="bg-[#111827] rounded-3xl p-6 border border-[#06B6D4]/10 shadow-card space-y-2 hover-glow transition-all">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Engaged Audience
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-3xl font-bold text-white">{totalParticipants}</span>
              <Users className="w-5 h-5 text-[#06B6D4]" />
            </div>
          </div>
        </div>

        {/* Create Event Card Container */}
        <div className="bg-[#111827] rounded-3xl p-8 border border-[#8B5CF6]/10 shadow-card mb-14">
          <div className="mb-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
              Quick Setup
            </span>
            <h2 className="font-heading text-2xl font-bold text-white">
              Create New Live Event
            </h2>
          </div>

          <form onSubmit={handleCreateEvent} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="E.g., Design Systems Workshop Q&A"
                className="w-full px-5 py-3.5 rounded-2xl border border-[#1E293B] bg-[#0B0F1A] text-white text-base placeholder:text-[#475569] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newEventTitle.trim()}
              className="gradient-btn text-white px-8 py-3.5 rounded-2xl font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2 whitespace-nowrap shadow-glow-sm hover:shadow-glow-md"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'Create Event'}</span>
            </button>
          </form>
        </div>

        {/* Events Grid Header with Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-heading text-3xl font-bold text-white">
              Your Quiz Collection
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Select an event to edit questions or broadcast live
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#64748B] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#1E293B] bg-[#0B0F1A] text-xs text-white focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 outline-none transition-all placeholder:text-[#475569]"
            />
          </div>
        </div>

        {/* Events Grid */}
        {loading ? (
          <div className="text-center py-16 text-[#64748B] italic font-heading">
            Loading your interactive collection...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center bg-[#111827] rounded-3xl border border-[#8B5CF6]/10 p-16 space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#8B5CF6]/15 flex items-center justify-center text-[#8B5CF6] mx-auto">
              <Presentation className="w-6 h-6" />
            </div>
            <h3 className="font-heading text-xl font-bold text-white">No events found</h3>
            <p className="text-sm text-[#64748B] max-w-sm mx-auto">
              {searchQuery ? 'No matching events for your search.' : 'Create your first event above to start interacting with your audience.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredEvents.map((event) => (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="bg-[#111827] rounded-3xl border border-[#8B5CF6]/10 p-7 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between group hover-glow"
                >
                  <div>
                    {/* Top Row: Status Pill & Room Code */}
                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${
                        event.isLive ? 'bg-[#F43F5E]/15 text-[#FB7185] border border-[#F43F5E]/30' : 'bg-[#1E293B] text-[#64748B]'
                      }`}>
                        {event.isLive ? '🔴 Live Now' : 'Draft / Ready'}
                      </span>

                      <button
                        onClick={() => copyRoomCode(event.roomCode)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0B0F1A] border border-[#1E293B] text-xs font-mono font-bold text-white hover:border-[#8B5CF6]/40 transition-colors"
                        title="Click to copy room code"
                      >
                        <span>{event.roomCode}</span>
                        {copiedCode === event.roomCode ? (
                          <Check className="w-3.5 h-3.5 text-[#10B981]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#64748B]" />
                        )}
                      </button>
                    </div>

                    {/* Title */}
                    <h3 className="font-heading text-2xl font-bold text-white mb-4 line-clamp-2 group-hover:text-[#A78BFA] transition-colors">
                      {event.title}
                    </h3>

                    {/* Metadata Counters */}
                    <div className="flex items-center gap-5 text-xs text-[#64748B] mb-6 pt-3 border-t border-[#1E293B]">
                      <div className="flex items-center gap-1.5">
                        <Presentation className="w-3.5 h-3.5 text-[#8B5CF6]" />
                        <span>{event._count?.questions || 0} Questions</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#06B6D4]" />
                        <span>{event._count?.participants || 0} Joined</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => navigate(`/events/${event.id}`)}
                      className="flex-1 bg-[#1E293B] hover:bg-[#8B5CF6] text-[#94A3B8] hover:text-white py-3 rounded-2xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 group/btn"
                    >
                      <span>Manage & Host</span>
                      <ArrowUpRight className="w-3.5 h-3.5 group-hover/btn:text-white transition-colors" />
                    </button>
                    {user?.role === 'ADMIN' && (
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-3 rounded-2xl text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 border border-transparent hover:border-[#F43F5E]/20 transition-all"
                        title="Delete Event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Footer />

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Event"
        message="Are you sure you want to delete this event? All questions and participant data will be permanently removed."
        confirmText="Delete Event"
        onConfirm={executeDelete}
        onCancel={() => setDeleteModal({ isOpen: false, eventId: null })}
        isDestructive={true}
      />

      <CreateAdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
