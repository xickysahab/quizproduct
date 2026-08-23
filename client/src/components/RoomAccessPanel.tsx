import React, { useState } from 'react';
import { KeyRound, UserX, Ban, Zap, ClipboardList, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

export type SessionMode = 'QUIZ' | 'SURVEY';

interface RoomAccessPanelProps {
  eventId: string;
  passcodeSet: boolean;
  allowAnonymous: boolean;
  roomCodeRetiredAt: string | null;
  speedBonusEnabled: boolean;
  sessionMode: SessionMode;
  onUpdated: () => void;
}

const RoomAccessPanel: React.FC<RoomAccessPanelProps> = ({
  eventId,
  passcodeSet,
  allowAnonymous,
  roomCodeRetiredAt,
  speedBonusEnabled,
  sessionMode,
  onUpdated,
}) => {
  const [passcode, setPasscode] = useState('');
  const [anonymous, setAnonymous] = useState(allowAnonymous);
  const [speedBonus, setSpeedBonus] = useState(speedBonusEnabled);
  const [mode, setMode] = useState<SessionMode>(sessionMode === 'SURVEY' ? 'SURVEY' : 'QUIZ');
  const [saving, setSaving] = useState(false);
  const retired = Boolean(roomCodeRetiredAt);
  const isSurvey = mode === 'SURVEY';

  React.useEffect(() => {
    setAnonymous(allowAnonymous);
  }, [allowAnonymous]);

  React.useEffect(() => {
    setSpeedBonus(speedBonusEnabled);
  }, [speedBonusEnabled]);

  React.useEffect(() => {
    setMode(sessionMode === 'SURVEY' ? 'SURVEY' : 'QUIZ');
  }, [sessionMode]);

  const save = async (payload: Record<string, unknown>, success: string) => {
    setSaving(true);
    try {
      await api.patch(`/events/${eventId}/access`, payload);
      toast.success(success);
      setPasscode('');
      onUpdated();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not update access settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 md:p-7 shadow-sm space-y-5 mb-10">
      <div>
        <h2 className="font-heading text-2xl font-bold text-gray-900">Session settings</h2>
        <p className="text-xs text-gray-500 mt-1">
          Choose quiz vs survey, then control who can join this PIN.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {isSurvey ? (
            <ClipboardList className="w-4 h-4 text-teal-600" />
          ) : (
            <Trophy className="w-4 h-4 text-indigo-600" />
          )}
          Session type
        </div>
        <p className="text-xs text-gray-500">
          Quiz grades answers and can show correct/incorrect. Survey collects opinions only — no scoring
          flash, no answer-key reveal.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={saving || mode === 'QUIZ'}
            onClick={() => {
              setMode('QUIZ');
              void save({ sessionMode: 'QUIZ' }, 'Switched to Quiz mode');
            }}
            className={`rounded-xl px-3 py-3 text-left border transition-colors ${
              mode === 'QUIZ'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            <span className="block text-sm font-semibold">Quiz</span>
            <span className="block text-[11px] mt-0.5 opacity-80">Scored · right/wrong feedback</span>
          </button>
          <button
            type="button"
            disabled={saving || mode === 'SURVEY'}
            onClick={() => {
              setMode('SURVEY');
              setSpeedBonus(false);
              void save({ sessionMode: 'SURVEY' }, 'Switched to Survey mode');
            }}
            className={`rounded-xl px-3 py-3 text-left border transition-colors ${
              mode === 'SURVEY'
                ? 'border-teal-300 bg-teal-50 text-teal-900'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            <span className="block text-sm font-semibold">Survey</span>
            <span className="block text-[11px] mt-0.5 opacity-80">Opinion · no grading</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            Passcode
          </div>
          <p className="text-xs text-gray-500">
            {passcodeSet
              ? 'A door code is required to join. Enter a new one to rotate it.'
              : 'Optional 4+ character code shared with the room.'}
          </p>
          <input
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={passcodeSet ? 'New passcode' : 'Set passcode'}
            maxLength={40}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || passcode.trim().length < 4}
              onClick={() => save({ passcode: passcode.trim() }, 'Passcode saved')}
              className="flex-1 gradient-btn text-white text-xs font-semibold py-2 rounded-xl disabled:opacity-40"
            >
              {passcodeSet ? 'Update' : 'Set'}
            </button>
            {passcodeSet && (
              <button
                type="button"
                disabled={saving}
                onClick={() => save({ passcode: '' }, 'Passcode removed')}
                className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <UserX className="w-4 h-4 text-indigo-600" />
            Anonymous join
          </div>
          <p className="text-xs text-gray-500">
            When on, participants can skip the name field — better for candid feedback.
          </p>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-gray-700">{anonymous ? 'Names optional' : 'Names required'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={anonymous}
              disabled={saving}
              onClick={() => {
                const next = !anonymous;
                setAnonymous(next);
                void save({ allowAnonymous: next }, next ? 'Anonymous join enabled' : 'Names are now required');
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                anonymous ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  anonymous ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </label>
        </div>

        <div
          className={`rounded-2xl border border-gray-200 p-4 space-y-3 ${
            isSurvey ? 'opacity-50' : ''
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Zap className="w-4 h-4 text-amber-500" />
            Speed bonus
          </div>
          <p className="text-xs text-gray-500">
            {isSurvey
              ? 'Only available in Quiz mode.'
              : 'Correct answers score 500–1000 based on how fast they came in (needs a time limit).'}
          </p>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-gray-700">{speedBonus ? 'On' : 'Off'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={speedBonus}
              disabled={saving || isSurvey}
              onClick={() => {
                const next = !speedBonus;
                setSpeedBonus(next);
                void save(
                  { speedBonusEnabled: next },
                  next ? 'Speed bonus enabled' : 'Speed bonus disabled'
                );
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                speedBonus && !isSurvey ? 'bg-amber-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  speedBonus && !isSurvey ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </label>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Ban className="w-4 h-4 text-red-500" />
            Retire room code
          </div>
          <p className="text-xs text-gray-500">
            {retired
              ? 'This PIN no longer accepts new joins.'
              : 'Stop new people joining without deleting the quiz or results.'}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              save(
                { retireCode: !retired },
                retired ? 'Room code reopened' : 'Room code retired'
              )
            }
            className={`w-full text-xs font-semibold py-2.5 rounded-xl border ${
              retired
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                : 'border-red-200 text-red-600 bg-red-50'
            }`}
          >
            {retired ? 'Reopen this PIN' : 'Retire this PIN'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomAccessPanel;
