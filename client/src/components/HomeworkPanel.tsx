import React, { useState } from 'react';
import { BookOpen, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

/** A datetime-local value, in the host's own timezone. */
const local = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Turns the session into homework: participants join from a link and work
 * through it alone between two times. Results land in each student's report.
 */
const HomeworkPanel: React.FC<{
  eventId: string;
  roomCode: string;
  selfPaced: boolean;
  opensAt: string | null;
  closesAt: string | null;
  onSaved: () => void;
}> = ({ eventId, roomCode, selfPaced, opensAt, closesAt, onSaved }) => {
  const [on, setOn] = useState(selfPaced);
  const [opens, setOpens] = useState(local(opensAt));
  const [closes, setCloses] = useState(local(closesAt));
  const [saving, setSaving] = useState(false);
  const link = `${window.location.origin}/?code=${roomCode}`;

  const save = async (next: boolean) => {
    setSaving(true);
    try {
      await api.patch(`/events/${eventId}/homework`, {
        selfPaced: next,
        // datetime-local has no zone; new Date reads it as the host's local time.
        opensAt: opens ? new Date(opens).toISOString() : undefined,
        closesAt: closes ? new Date(closes).toISOString() : undefined,
      });
      setOn(next);
      toast.success(next ? 'Homework is set. Share the link.' : 'Back to a live session.');
      onSaved();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm';

  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-3xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-heading text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent" /> Homework
          </h3>
          <p className="text-xs text-gray-500">
            Students finish it on their own before a deadline — no one needs to run it live.
          </p>
        </div>
        {on && (
          <button onClick={() => save(false)} disabled={saving} className="text-xs font-semibold text-gray-500">
            Turn off
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-600 space-y-1">
          <span>Opens (optional)</span>
          <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className={field} />
        </label>
        <label className="text-xs font-semibold text-gray-600 space-y-1">
          <span>Closes</span>
          <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={field} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => save(true)}
          disabled={saving || !closes}
          className="gradient-btn text-white font-semibold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
        >
          {on ? 'Update homework' : 'Set as homework'}
        </button>
        {on && (
          <button
            onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied.'))}
            className="text-sm font-semibold text-accent inline-flex items-center gap-1.5"
          >
            <Copy className="w-4 h-4" /> Copy the link for students
          </button>
        )}
      </div>
    </section>
  );
};

export default HomeworkPanel;
