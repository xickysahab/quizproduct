import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface Standing {
  teamId: string;
  name: string;
  members: number;
  average: number;
  rank: number;
}

/**
 * Team quiz: the host names the teams before anyone joins; participants pick
 * one or are balanced into the smallest. Teams rank by average score.
 */
const TeamsPanel: React.FC<{ eventId: string; teams: { id: string; name: string }[]; onSaved: () => void }> = ({
  eventId,
  teams,
  onSaved,
}) => {
  const [names, setNames] = useState(teams.map((t) => t.name).join('\n'));
  const [saving, setSaving] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]);

  useEffect(() => {
    if (!teams.length) return;
    api
      .get(`/analytics/events/${eventId}/leaderboard`)
      .then((res) => setStandings(res.data.teams || []))
      .catch(() => undefined);
  }, [eventId, teams.length]);

  const save = async (list: string[]) => {
    setSaving(true);
    try {
      await api.put(`/events/${eventId}/teams`, { names: list });
      toast.success(list.length ? 'Teams saved.' : 'Team mode is off.');
      onSaved();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Could not save the teams.');
    } finally {
      setSaving(false);
    }
  };

  const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
  const played = standings.some((s) => s.members > 0);

  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-3xl p-6 space-y-4">
      <div>
        <h3 className="font-heading text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Teams
        </h3>
        <p className="text-xs text-gray-500">
          One team per line. People pick one when they join, or go into the smallest. Teams are ranked by their
          average score, so a big team does not win on numbers alone.
        </p>
      </div>

      {played ? (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left py-1.5">Place</th>
              <th className="text-left py-1.5">Team</th>
              <th className="text-right py-1.5">Members</th>
              <th className="text-right py-1.5">Average</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.teamId} className="border-t border-gray-100">
                <td className="py-1.5 tabular">{s.rank}</td>
                <td className="py-1.5 font-medium">{s.name}</td>
                <td className="py-1.5 text-right tabular">{s.members}</td>
                <td className="py-1.5 text-right tabular font-semibold">{s.average}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder={'Red\nBlue\nGreen'}
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
          />
          <div className="flex gap-3">
            <button
              onClick={() => save(list)}
              disabled={saving || list.length < 2}
              className="gradient-btn text-white font-semibold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
            >
              {teams.length ? 'Update teams' : 'Make it a team quiz'}
            </button>
            {teams.length > 0 && (
              <button onClick={() => save([])} disabled={saving} className="text-xs font-semibold text-gray-500">
                Turn off
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default TeamsPanel;
