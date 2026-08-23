import api from '../services/api';

/**
 * Local answer queue for congested networks.
 *
 * An auditorium of 300 phones on shared 4G is the normal case for this product,
 * not the edge case. Without this, an answer submitted during a dead moment is
 * simply lost and the participant has no idea — they tapped, nothing happened,
 * and the host advanced.
 *
 * Answers are held in localStorage, so they survive a reload as well as a
 * network drop, and flushed when connectivity returns.
 */

const KEY = 'pendingAnswers';
const MAX_QUEUED = 40;

export interface QueuedAnswer {
  questionId: string;
  payload: Record<string, unknown>;
  queuedAt: number;
}

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

const notify = (count: number) => listeners.forEach((listener) => listener(count));

export const onQueueChange = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const read = (): QueuedAnswer[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedAnswer[]) : [];
  } catch {
    return [];
  }
};

const write = (entries: QueuedAnswer[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_QUEUED)));
  } catch {
    /* storage full or disabled — the in-flight answer still tried to send */
  }
  notify(entries.length);
};

export const pendingCount = (): number => read().length;

/**
 * Queues an answer, replacing any earlier one for the same question — a
 * participant changing their mind offline should send one answer, not two.
 */
export const enqueue = (questionId: string, payload: Record<string, unknown>): void => {
  const entries = read().filter((entry) => entry.questionId !== questionId);
  entries.push({ questionId, payload, queuedAt: Date.now() });
  write(entries);
};

export const clearQueue = (): void => write([]);

let flushing = false;

/**
 * Sends everything queued, oldest first.
 *
 * A 4xx means the server rejected the answer on its merits — the question
 * closed, the time ran out — so the entry is dropped rather than retried
 * forever. Only a network failure or a 5xx keeps it queued.
 */
export const flushQueue = async (): Promise<{ sent: number; dropped: number }> => {
  if (flushing) return { sent: 0, dropped: 0 };
  flushing = true;

  let sent = 0;
  let dropped = 0;

  try {
    const entries = read();
    const remaining: QueuedAnswer[] = [];

    for (const entry of entries) {
      try {
        await api.post('/participants/response', {
          questionId: entry.questionId,
          ...entry.payload,
        });
        sent += 1;
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;

        if (status && status >= 400 && status < 500) {
          dropped += 1;
          continue;
        }

        remaining.push(entry);
      }
    }

    write(remaining);
  } finally {
    flushing = false;
  }

  return { sent, dropped };
};

/** Retries whenever the browser reports connectivity, and once on load. */
export const startAutoFlush = (): (() => void) => {
  const handler = () => void flushQueue();
  window.addEventListener('online', handler);
  if (navigator.onLine) handler();

  return () => window.removeEventListener('online', handler);
};
