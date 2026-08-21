import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001',
});

// Add a request interceptor to inject the token
api.interceptors.request.use(
  (config) => {
    if (config.headers) {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Participants are not logged in; their room session travels in its own
      // header so it never collides with a host session in the same browser.
      const participantToken = localStorage.getItem('participantToken');
      if (participantToken) {
        config.headers['X-Participant-Token'] = participantToken;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
