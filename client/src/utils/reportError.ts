import api from '../services/api';

/**
 * Sends a browser error to the server, which logs it and alerts whoever is on
 * call. A beacon, so it still goes out as the page dies or navigates away.
 *
 * Only the message, stack and path — never storage, tokens or form contents.
 * Capped per page load, so a render loop cannot flood the endpoint.
 */
let sent = 0;
const LIMIT = 5;

export const reportError = (error: unknown, kind: 'render' | 'unhandled' | 'rejection'): void => {
  if (sent >= LIMIT || import.meta.env.DEV) return;
  sent += 1;
  const err = error instanceof Error ? error : new Error(String(error));
  const body = JSON.stringify({
    kind,
    message: err.message,
    stack: err.stack,
    path: window.location.pathname,
  });
  const url = `${api.defaults.baseURL}/client-errors`;
  try {
    if (!navigator.sendBeacon?.(url, body)) {
      void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => undefined);
    }
  } catch {
    /* reporting must never throw */
  }
};

/** Errors no component caught. */
export const listenForUncaughtErrors = (): void => {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'unhandled'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'rejection'));
};
