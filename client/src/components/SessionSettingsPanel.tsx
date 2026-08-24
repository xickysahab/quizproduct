import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound, Ban, MessagesSquare, Trophy, Zap, Flame, Eye, EyeOff,
  Monitor, Volume2, ListOrdered, Info, AlertTriangle, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

/**
 * The session's personality.
 *
 * Presets sit on top; the switches underneath are what the server actually
 * reads. Touching any switch moves the session to Custom, which is what makes
 * mixing possible — a host can run a scored game with Q&A open throughout, or
 * a discussion that ends with one graded question.
 *
 * The server resolves impossible combinations and returns what it corrected and
 * why. Those reasons are shown here rather than a control just going dead.
 */

export type LeaderboardVisibility = 'HIDDEN' | 'HOST_ONLY' | 'EVERYONE';
export type ResultsReveal = 'HOST_TRIGGERED' | 'AUTO_AFTER_QUESTION' | 'NEVER';

export interface SessionSwitches {
  scoringEnabled: boolean;
  speedBonusEnabled: boolean;
  streakBonusEnabled: boolean;
  leaderboardVisibility: LeaderboardVisibility;
  scoreboardBetweenQuestions: boolean;
  podiumAtEnd: boolean;
  resultsReveal: ResultsReveal;
  autoAdvance: boolean;
  phoneShowsQuestion: boolean;
  soundEnabled: boolean;
  qaEnabled: boolean;
  qaModerated: boolean;
}

interface Conflict {
  field: keyof SessionSwitches;
  because: keyof SessionSwitches;
  severity: 'forced' | 'warning';
  message: string;
}

interface PresetInfo {
  id: string;
  label: string;
  blurb: string;
  switches: SessionSwitches | null;
}

interface Props {
  eventId: string;
  preset: string;
  switches: SessionSwitches;
  passcodeSet: boolean;
  roomCodeRetiredAt: string | null;
  onUpdated: () => void;
}

type ToggleKey =
  | 'scoringEnabled' | 'speedBonusEnabled' | 'streakBonusEnabled'
  | 'scoreboardBetweenQuestions' | 'podiumAtEnd' | 'autoAdvance'
  | 'phoneShowsQuestion' | 'soundEnabled' | 'qaEnabled' | 'qaModerated';

const TOGGLES: {
  key: ToggleKey;
  label: string;
  hint: string;
  icon: React.ReactNode;
  group: 'scoring' | 'qa' | 'stage';
}[] = [
  { key: 'scoringEnabled', label: 'Score answers', hint: 'Off means nobody wins — the meeting shape.', icon: <Trophy className="w-4 h-4" />, group: 'scoring' },
  { key: 'speedBonusEnabled', label: 'Speed bonus', hint: 'Answer sooner, score higher. Needs a timer.', icon: <Zap className="w-4 h-4" />, group: 'scoring' },
  { key: 'streakBonusEnabled', label: 'Streak bonus', hint: 'Extra points for consecutive correct answers.', icon: <Flame className="w-4 h-4" />, group: 'scoring' },
  { key: 'scoreboardBetweenQuestions', label: 'Scoreboard between questions', hint: 'A pause showing who moved. The moment people remember.', icon: <ListOrdered className="w-4 h-4" />, group: 'scoring' },
  { key: 'podiumAtEnd', label: 'Podium at the end', hint: 'Top three, full screen.', icon: <Trophy className="w-4 h-4" />, group: 'scoring' },

  { key: 'qaEnabled', label: 'Audience questions', hint: 'People ask and upvote throughout the session.', icon: <MessagesSquare className="w-4 h-4" />, group: 'qa' },
  { key: 'qaModerated', label: 'Review before showing', hint: 'Questions wait for your approval.', icon: <Eye className="w-4 h-4" />, group: 'qa' },

  { key: 'phoneShowsQuestion', label: 'Show the question on phones', hint: 'Off keeps eyes on the shared screen.', icon: <Monitor className="w-4 h-4" />, group: 'stage' },
  { key: 'soundEnabled', label: 'Countdown sound', hint: 'Audio on the audience display.', icon: <Volume2 className="w-4 h-4" />, group: 'stage' },
  { key: 'autoAdvance', label: 'Advance automatically', hint: 'Move on when the timer runs out.', icon: <ListOrdered className="w-4 h-4" />, group: 'stage' },
];

const GROUPS: { id: 'scoring' | 'qa' | 'stage'; title: string }[] = [
  { id: 'scoring', title: 'Scoring & competition' },
  { id: 'qa', title: 'Audience questions' },
  { id: 'stage', title: 'On screen' },
];

const SessionSettingsPanel: React.FC<Props> = ({
  eventId, preset, switches, passcodeSet, roomCodeRetiredAt, onUpdated,
}) => {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [local, setLocal] = useState<SessionSwitches>(switches);
  const [activePreset, setActivePreset] = useState(preset);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [passcode, setPasscode] = useState('');
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => setLocal(switches), [switches]);
  useEffect(() => setActivePreset(preset), [preset]);

  useEffect(() => {
    api.get('/events/presets')
      .then((res) => setPresets(res.data.presets || []))
      .catch(() => undefined);
  }, []);

  const save = useCallback(
    async (body: Record<string, unknown>, message: string) => {
      setSaving(true);
      try {
        const res = await api.patch(`/events/${eventId}/access`, body);
        setLocal(res.data.switches);
        setActivePreset(res.data.preset);
        setConflicts(res.data.conflicts || []);
        setRisks(res.data.risks || []);

        // The server may have corrected something. Say so rather than letting a
        // toggle silently spring back.
        const forced = (res.data.conflicts || []).filter((c: Conflict) => c.severity === 'forced');
        if (forced.length > 0) {
          toast.success(`${message} — ${forced.length} setting${forced.length === 1 ? '' : 's'} adjusted to match`);
        } else {
          toast.success(message);
        }
        onUpdated();
      } catch (error) {
        const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        toast.error(msg || 'Could not save that.');
      } finally {
        setSaving(false);
      }
    },
    [eventId, onUpdated]
  );

  /** A control is locked when a forced rule is currently holding it. */
  const lockedBy = (key: keyof SessionSwitches): Conflict | undefined =>
    conflicts.find((c) => c.field === key && c.severity === 'forced');

  const warningFor = (key: keyof SessionSwitches): Conflict | undefined =>
    conflicts.find((c) => c.field === key && c.severity === 'warning');

  const retired = Boolean(roomCodeRetiredAt);

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-6">
      <div>
        <h3 className="font-heading text-lg font-bold text-gray-900">How this session runs</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Pick a starting point, then change anything you like.
        </p>
      </div>

      {/* ---- presets ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {presets.map((p) => {
          const active = activePreset === p.id;
          return (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => save({ preset: p.id }, `${p.label} settings applied`)}
              className={`text-left p-4 rounded-2xl border transition-colors disabled:opacity-50 ${
                active
                  ? 'border-accent bg-accent-wash ring-2 ring-accent'
                  : 'border-gray-200 bg-white hover:border-accent-soft'
              }`}
            >
              <span className={`block font-semibold text-sm ${active ? 'text-accent' : 'text-gray-900'}`}>
                {p.label}
                {active && <span className="ml-2 text-[10px] uppercase tracking-wider">Active</span>}
              </span>
              <span className="block text-xs text-gray-500 mt-1 leading-snug">{p.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* ---- what the server corrected ---- */}
      {conflicts.filter((c) => c.severity === 'forced').length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600">
            <Info className="w-3.5 h-3.5" /> Adjusted to match
          </p>
          <ul className="space-y-1">
            {conflicts.filter((c) => c.severity === 'forced').map((c) => (
              <li key={c.field} className="text-xs text-gray-600">{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {(conflicts.some((c) => c.severity === 'warning') || risks.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Worth knowing
          </p>
          <ul className="space-y-1">
            {conflicts.filter((c) => c.severity === 'warning').map((c) => (
              <li key={`w-${c.field}`} className="text-xs text-amber-800">{c.message}</li>
            ))}
            {risks.map((r) => (
              <li key={r} className="text-xs text-amber-800">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- individual switches ---- */}
      <div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="text-sm font-semibold text-accent hover:text-accent"
        >
          {advanced ? 'Hide individual settings' : 'Change individual settings'}
        </button>

        {advanced && (
          <div className="mt-4 space-y-5">
            {GROUPS.map((group) => (
              <div key={group.id} className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  {group.title}
                </p>

                {TOGGLES.filter((t) => t.group === group.id).map((toggle) => {
                  const locked = lockedBy(toggle.key);
                  const warned = warningFor(toggle.key);
                  const on = Boolean(local[toggle.key]);

                  return (
                    <div
                      key={toggle.key}
                      className={`flex items-start gap-3 p-3 rounded-xl border ${
                        locked ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <span className="text-gray-400 mt-0.5">{toggle.icon}</span>

                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900">
                          {toggle.label}
                          {locked && <Lock className="inline w-3 h-3 ml-1.5 text-gray-400" />}
                        </span>
                        <span className="block text-xs text-gray-500 leading-snug">
                          {locked ? locked.message : warned ? warned.message : toggle.hint}
                        </span>
                      </div>

                      <button
                        role="switch"
                        aria-checked={on}
                        aria-label={toggle.label}
                        disabled={saving || Boolean(locked)}
                        onClick={() => save({ [toggle.key]: !on }, `${toggle.label} ${!on ? 'on' : 'off'}`)}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed ${
                          on ? 'bg-accent' : 'bg-gray-300'
                        } ${locked ? 'opacity-40' : ''}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            on ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ---- choices that are not on/off ---- */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Who sees what
              </p>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                <span className="flex items-center gap-2 text-sm text-gray-900">
                  <Trophy className="w-4 h-4 text-gray-400" /> Leaderboard
                </span>
                <select
                  value={local.leaderboardVisibility}
                  disabled={saving || Boolean(lockedBy('leaderboardVisibility'))}
                  onChange={(e) => save({ leaderboardVisibility: e.target.value }, 'Leaderboard updated')}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
                >
                  <option value="HIDDEN">Nobody</option>
                  <option value="HOST_ONLY">Only me</option>
                  <option value="EVERYONE">Everyone</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                <span className="flex items-center gap-2 text-sm text-gray-900">
                  <EyeOff className="w-4 h-4 text-gray-400" /> Show results
                </span>
                <select
                  value={local.resultsReveal}
                  disabled={saving}
                  onChange={(e) => save({ resultsReveal: e.target.value }, 'Reveal updated')}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
                >
                  <option value="HOST_TRIGGERED">When I press the button</option>
                  <option value="AUTO_AFTER_QUESTION">Automatically after each question</option>
                  <option value="NEVER">Never to the audience</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ---- room access ---- */}
      <div className="pt-5 border-t border-gray-100 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Room access</p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[180px]">
            <span className="block text-xs text-gray-500 mb-1">
              {passcodeSet ? 'Passcode is set — type a new one to change it' : 'Add a passcode (optional)'}
            </span>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="At least 4 characters"
              autoComplete="off"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-accent"
            />
          </label>

          <button
            disabled={saving || (!passcode.trim() && !passcodeSet)}
            onClick={() => {
              void save({ passcode: passcode.trim() }, passcode.trim() ? 'Passcode set' : 'Passcode removed');
              setPasscode('');
            }}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40"
          >
            <KeyRound className="inline w-3.5 h-3.5 mr-1.5" />
            {passcode.trim() ? 'Set' : 'Remove'}
          </button>
        </div>

        <button
          disabled={saving}
          onClick={() => save({ retireCode: !retired }, retired ? 'Room reopened' : 'Room closed')}
          className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${
            retired
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <Ban className="inline w-3.5 h-3.5 mr-1.5" />
          {retired ? 'Reopen this room' : 'Close the room to new joins'}
        </button>
      </div>
    </div>
  );
};

export default SessionSettingsPanel;
