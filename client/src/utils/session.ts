/**
 * A stable per-device key for a participant.
 *
 * Sent with every join so the server reuses the same Participant row instead of
 * creating a duplicate — which used to split a person's score across two
 * leaderboard entries and burn a second seat against the plan's cap.
 */
const KEY = 'participantSessionKey';

export const getSessionKey = (): string => {
  let key = localStorage.getItem(KEY);
  if (!key) {
    key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, key);
  }
  return key;
};

/** Display label for a participant who joined without a name. */
export const displayName = (name: string | null | undefined): string =>
  name && name.trim() ? name : 'Anonymous';
