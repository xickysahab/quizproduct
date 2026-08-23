import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001',
});

// Add a request interceptor to inject the token
/** Endpoints authenticated by the room token rather than a host login. */
const isParticipantEndpoint = (url: string | undefined): boolean =>
  Boolean(url && url.startsWith('/participants'));

api.interceptors.request.use(
  (config) => {
    if (config.headers) {
      if (isParticipantEndpoint(config.url)) {
        // Participants are not logged in; their room session travels in its own
        // header so it never collides with a host session in the same browser.
        // Scoped to participant routes so a host's dashboard calls are
        // unambiguously host calls.
        const participantToken = localStorage.getItem('participantToken');
        if (participantToken) {
          config.headers['X-Participant-Token'] = participantToken;
        }
      } else {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/** Routes a signed-out host should not be left sitting on. */
const isHostRoute = (path: string): boolean =>
  !['/', '/login', '/forgot-password', '/reset-password', '/accept-invite'].includes(path) &&
  !path.startsWith('/live/');

/**
 * A rejected host session used to leave the user staring at a page of failed
 * requests. Clear it and send them to the login form once, rather than letting
 * every subsequent call fail the same way.
 *
 * Participant 401s are deliberately left alone — LiveQuiz handles those itself,
 * since a participant has no login to return to.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (
      status === 401 &&
      !isParticipantEndpoint(error?.config?.url) &&
      localStorage.getItem('token')
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      if (isHostRoute(window.location.pathname)) {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
