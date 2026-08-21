import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Presentation, Users, Trash2, Copy, Check, Search, ArrowUpRight, CopyPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ConfirmModal from '../components/ConfirmModal';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';

interface Event {
  id: string;
  title: string;
  roomCode: string;
  isLive: boolean;
  createdAt: string;
  host?: { id: string; name: string; email: string; role: string };
  _count: {
    questions: number;
    participants: number;
  };
}

const Quizzes: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; eventId: string | null }>({ isOpen: false, eventId: null });
  const [newEventTitle, setNewEventTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchEvents = async (nextPage = 1, append = false) => {
    try {
      const response = await api.get('/events', { params: { page: nextPage, limit: 60 } });
      setEvents((prev) => (append ? [...prev, ...response.data.events] : response.data.events));
      setHasMore(Boolean(response.data.pagination?.hasMore));
      setPage(nextPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(1);
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    setCreating(true);
    try {
      await api.post('/events', { title: newEventTitle.trim() });
      toast.success('Quiz created!');
      setNewEventTitle('');
      fetchEvents(1);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create quiz');
    } finally {
      setCreating(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteModal.eventId) return;
    try {
      await api.delete(`/events/${deleteModal.eventId}`);
      toast.success('Quiz deleted');
      setDeleteModal({ isOpen: false, eventId: null });
      fetchEvents(1);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete quiz');
      setDeleteModal({ isOpen: false, eventId: null });
    }
  };

  const duplicateEvent = async (eventId: string) => {
    try {
      const res = await api.post(`/events/${eventId}/duplicate`);
      toast.success('Quiz duplicated');
      navigate(`/events/${res.data.event.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not duplicate quiz');
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
      e.roomCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.host?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showHostColumn = user?.role !== 'STAFF';

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {user?.role === 'STAFF' ? 'My Quizzes' : 'Quizzes'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Select a quiz to edit questions or broadcast live
          </p>
        </div>

        {/* Create Quiz inline form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleCreateEvent} className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              placeholder="E.g., Design Systems Workshop Q&A"
              className="flex-1 px-5 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-900 text-sm focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={creating || !newEventTitle.trim()}
              className="gradient-btn text-white px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2 whitespace-nowrap shadow-sm hover:shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'Create Quiz'}</span>
            </button>
          </form>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, code or host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-xs text-gray-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 shadow-sm"
          />
        </div>

        {/* Quizzes grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading quizzes...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center bg-white rounded-2xl border border-gray-200 p-16 space-y-4 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mx-auto">
              <Presentation className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">No quizzes found</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              {searchQuery ? 'No matching quizzes for your search.' : 'Create your first quiz above to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                  className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${
                        event.isLive
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {event.isLive ? '🔴 Live Now' : 'Draft / Ready'}
                      </span>

                      <button
                        onClick={() => copyRoomCode(event.roomCode)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs font-mono font-bold text-gray-900 hover:border-indigo-300 transition-colors"
                        title="Click to copy room code"
                      >
                        <span>{event.roomCode}</span>
                        {copiedCode === event.roomCode ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {event.title}
                    </h3>

                    {showHostColumn && event.host && (
                      <p className="text-xs text-gray-500 mb-3">
                        Host: <span className="font-medium text-gray-700">{event.host.name}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-bold text-gray-500">{event.host.role}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-5 text-xs text-gray-500 mb-5 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <Presentation className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{event._count?.questions || 0} Questions</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-cyan-600" />
                        <span>{event._count?.participants || 0} Joined</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate(`/events/${event.id}`)}
                      className="flex-1 bg-gray-100 hover:bg-indigo-600 text-gray-700 hover:text-white py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Manage & Host</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => duplicateEvent(event.id)}
                      className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                      title="Duplicate quiz"
                    >
                      <CopyPlus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, eventId: event.id })}
                      className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                      title="Delete Quiz"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {hasMore && !searchQuery && (
          <div className="text-center">
            <button
              onClick={() => fetchEvents(page + 1, true)}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Quiz"
        message="Are you sure you want to delete this quiz? All questions and participant data will be permanently removed."
        confirmText="Delete Quiz"
        onConfirm={executeDelete}
        onCancel={() => setDeleteModal({ isOpen: false, eventId: null })}
        isDestructive={true}
      />
    </DashboardLayout>
  );
};

export default Quizzes;
