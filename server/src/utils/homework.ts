/**
 * Homework: a session participants work through on their own, between an
 * opening and a closing time, with no host driving it.
 */

export interface HomeworkWindow {
  selfPaced: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
}

/** Why this homework cannot be worked on right now, or null if it can. */
export const windowProblem = (event: HomeworkWindow, now = new Date()): string | null => {
  if (event.opensAt && now < event.opensAt) {
    return 'This homework has not opened yet.';
  }
  if (event.closesAt && now > event.closesAt) {
    return 'This homework has closed.';
  }
  return null;
};

/** Parses and checks a window a host is setting. */
export const parseWindow = (
  opensAt: unknown,
  closesAt: unknown
): { ok: true; opensAt: Date | null; closesAt: Date } | { ok: false; message: string } => {
  const toDate = (v: unknown) => (typeof v === 'string' && v ? new Date(v) : null);
  const opens = toDate(opensAt);
  const closes = toDate(closesAt);

  if (!closes || Number.isNaN(closes.getTime())) return { ok: false, message: 'Set when the homework closes.' };
  if (opens && Number.isNaN(opens.getTime())) return { ok: false, message: 'That opening time is not a date.' };
  if (opens && closes <= opens) return { ok: false, message: 'The homework has to close after it opens.' };
  if (closes.getTime() <= Date.now()) return { ok: false, message: 'The closing time is already in the past.' };
  return { ok: true, opensAt: opens, closesAt: closes };
};
