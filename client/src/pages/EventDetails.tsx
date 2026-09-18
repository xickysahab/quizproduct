import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Copy, Download, Eraser, Play, Plus, Presentation } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { dashboardTitleForRole, sidebarForRole } from '../config/sidebar';
import QuestionForm from '../components/QuestionForm';
import { DraftList } from '../components/AiDraftModal';
import QuestionTools from '../components/QuestionTools';
import HomeworkPanel from '../components/HomeworkPanel';
import TeamsPanel from '../components/TeamsPanel';
import ConcludeSettingsModal from '../components/ConcludeSettingsModal';
import SessionSettingsPanel from '../components/SessionSettingsPanel';
import type { SessionSwitches } from '../components/SessionSettingsPanel';
import ConfirmModal from '../components/ConfirmModal';
import SegmentedControl from '../components/SegmentedControl';
import MenuButton from '../components/MenuButton';
import QuestionList from '../components/event/QuestionList';
import EventResults from '../components/event/EventResults';
import { themeFor } from '../utils/sessionTheme';

type Tab = 'questions' | 'settings' | 'results';

/**
 * A session, in three places: what gets asked, how the room runs, and how it
 * went. The one thing a host comes here to do — present — is the one button
 * that stands out; anything that deletes data sits behind More.
 */
const EventDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (['questions', 'settings', 'results'].includes(params.get('tab') || '') ? params.get('tab') : 'questions') as Tab;
  const setTab = (next: Tab) => setParams(next === 'questions' ? {} : { tab: next }, { replace: true });

  const [event, setEvent] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [resultsScreenOpen, setResultsScreenOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);

  const fetchEventDetails = useCallback(async () => {
    try {
      const response = await api.get(`/events/${id}`);
      setEvent(response.data.event);
    } catch {
      navigate('/dashboard');
    }
  }, [id, navigate]);

  useEffect(() => {
    void fetchEventDetails();
  }, [fetchEventDetails]);

  const errorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

  const handleAddQuestion = async (data: any) => {
    await api.post('/questions', { ...data, eventId: id });
    // An accepted draft leaves the review list.
    if (editingQuestion?.draftKey) setDrafts((d) => d.filter((x) => x.draftKey !== editingQuestion.draftKey));
    void fetchEventDetails();
  };

  const handleEditQuestion = async (data: any) => {
    await api.put(`/questions/${editingQuestion.id}`, data);
    void fetchEventDetails();
  };

  const saveResultsScreen = async (config: any) => {
    try {
      await api.put(`/events/${id}/config`, { concludeConfig: config });
      toast.success('Results screen saved.');
      void fetchEventDetails();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save that setting.'));
    }
  };

  const clearData = async () => {
    try {
      await api.delete(`/events/${id}/clear-data`);
      toast.success('Participants and their answers are cleared.');
      void fetchEventDetails();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not clear participant data.'));
    } finally {
      setClearing(false);
    }
  };

  const deleteQuestion = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/questions/${deleting}`);
      void fetchEventDetails();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete that question.'));
    } finally {
      setDeleting(null);
    }
  };

  const exportCsv = async () => {
    try {
      const response = await api.get(`/analytics/events/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}_results.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not download the results.'));
    }
  };

  const openForm = (q: any) => {
    setEditingQuestion(q);
    setFormOpen(true);
  };

  const copyPin = () =>
    navigator.clipboard.writeText(event.roomCode).then(() => toast.success('Room code copied.'));

  const sections = sidebarForRole(user?.role);
  // The list this quiz lives in, for the back link and the sidebar highlight.
  const quizzesHref = sections.find((s) => s.href.endsWith('/quizzes'))?.href ?? '/dashboard';

  const shell = (children: React.ReactNode) => (
    <div data-mode={themeFor(event)}>
      <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sections} activeHref={quizzesHref}>
        {children}
      </DashboardLayout>
    </div>
  );

  if (!event) {
    return shell(
      <div className="space-y-4" aria-label="Loading">
        <div className="h-5 w-24 rounded bg-gray-200 animate-pulse" />
        <div className="h-10 w-2/3 rounded-lg bg-gray-200 animate-pulse" />
        <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const survey = event.sessionMode === 'SURVEY';
  const questionCount = event.questions.length;
  const participantCount = event._count?.participants ?? 0;

  return shell(
    <>
      <Link to={quizzesHref} className="inline-flex items-center gap-0.5 -ml-1.5 text-[15px] text-accent mb-3">
        <ChevronLeft className="w-5 h-5" /> Quizzes
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-7">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="px-2 py-0.5 rounded-full bg-accent-wash text-accent font-semibold">
              {event.selfPaced ? 'Homework' : survey ? 'Survey' : 'Quiz'}
            </span>
            <span>
              {questionCount} {questionCount === 1 ? 'question' : 'questions'}
            </span>
            <button onClick={copyPin} className="inline-flex items-center gap-1.5 hover:text-ink" title="Copy room code">
              Code <span className="font-mono font-semibold text-ink tracking-wider">{event.roomCode}</span>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <h1 className="text-[34px] sm:text-[40px] font-bold text-ink break-words">{event.title}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!event.selfPaced && (
            <button
              onClick={() => navigate(`/host/live/${id}`)}
              disabled={questionCount === 0}
              title={questionCount === 0 ? 'Add a question first' : undefined}
              className="btn-primary inline-flex items-center gap-2 px-5 h-10 rounded-full text-[15px] disabled:opacity-40"
            >
              <Play className="w-4 h-4 fill-current" /> Present
            </button>
          )}
          <MenuButton
            groups={[
              [
                { label: 'Download results (CSV)', icon: Download, onSelect: exportCsv },
                { label: 'Results screen…', icon: Presentation, onSelect: () => setResultsScreenOpen(true) },
              ],
              [{ label: 'Clear participants…', icon: Eraser, onSelect: () => setClearing(true), destructive: true }],
            ]}
          />
        </div>
      </header>

      <div className="mb-6 overflow-x-auto">
        <SegmentedControl
          id="event-tabs"
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'questions', label: 'Questions' },
            { value: 'settings', label: 'Settings' },
            { value: 'results', label: participantCount ? `Results · ${participantCount}` : 'Results' },
          ]}
        />
      </div>

      {tab === 'questions' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openForm(null)}
              className="btn-primary inline-flex items-center gap-1.5 px-4 h-9 rounded-full text-[14px]"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} /> Add question
            </button>
            <QuestionTools eventId={id!} onDrafts={setDrafts} onImported={fetchEventDetails} />
          </div>

          {drafts.length > 0 && (
            <DraftList
              eventId={id!}
              survey={survey}
              drafts={drafts}
              setDrafts={setDrafts}
              onReview={openForm}
              onAdded={fetchEventDetails}
            />
          )}

          {questionCount === 0 && drafts.length === 0 ? (
            <div className="text-center py-16 px-6 rounded-2xl bg-surface border border-line">
              <p className="text-[20px] font-semibold text-ink">Nothing to ask yet</p>
              <p className="text-[15px] text-muted mt-1.5 max-w-sm mx-auto">
                Type a question, draft them from a chapter PDF, or bring a question bank in from Excel.
              </p>
            </div>
          ) : (
            <QuestionList eventId={id!} questions={event.questions} onEdit={openForm} onDelete={setDeleting} />
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section className="space-y-6">
          <SessionSettingsPanel
            eventId={id!}
            preset={event.preset || 'CUSTOM'}
            switches={
              {
                scoringEnabled: event.scoringEnabled !== false,
                speedBonusEnabled: Boolean(event.speedBonusEnabled),
                streakBonusEnabled: Boolean(event.streakBonusEnabled),
                leaderboardVisibility: event.leaderboardVisibility || 'EVERYONE',
                scoreboardBetweenQuestions: Boolean(event.scoreboardBetweenQuestions),
                podiumAtEnd: event.podiumAtEnd !== false,
                resultsReveal: event.resultsReveal || 'HOST_TRIGGERED',
                autoAdvance: Boolean(event.autoAdvance),
                phoneShowsQuestion: event.phoneShowsQuestion !== false,
                soundEnabled: Boolean(event.soundEnabled),
                qaEnabled: event.qaEnabled !== false,
                qaModerated: Boolean(event.qaModerated),
              } as SessionSwitches
            }
            passcodeSet={Boolean(event.passcodeSet)}
            roomCodeRetiredAt={event.roomCodeRetiredAt ?? null}
            onUpdated={fetchEventDetails}
          />
          <HomeworkPanel
            eventId={id!}
            roomCode={event.roomCode}
            selfPaced={Boolean(event.selfPaced)}
            opensAt={event.opensAt}
            closesAt={event.closesAt}
            onSaved={fetchEventDetails}
          />
          <TeamsPanel eventId={id!} teams={event.teams || []} onSaved={fetchEventDetails} />
        </section>
      )}

      {tab === 'results' && <EventResults eventId={id!} scored={!survey} />}

      <QuestionForm
        open={formOpen}
        initialData={editingQuestion}
        surveyMode={survey}
        onClose={() => setFormOpen(false)}
        onSubmit={editingQuestion?.id ? handleEditQuestion : handleAddQuestion}
      />

      <ConfirmModal
        isOpen={deleting !== null}
        title="Delete this question?"
        message="Its answers from past sessions go with it. This cannot be undone."
        confirmText="Delete"
        onConfirm={deleteQuestion}
        onCancel={() => setDeleting(null)}
        isDestructive
      />

      <ConfirmModal
        isOpen={clearing}
        title="Clear everyone who joined?"
        message="The questions stay. Every participant and every answer they gave is deleted, and cannot be brought back."
        confirmText="Clear participants"
        onConfirm={clearData}
        onCancel={() => setClearing(false)}
        isDestructive
      />

      <ConcludeSettingsModal
        isOpen={resultsScreenOpen}
        onClose={() => setResultsScreenOpen(false)}
        onSave={saveResultsScreen}
        initialConfig={event.concludeConfig}
      />
    </>
  );
};

export default EventDetails;
