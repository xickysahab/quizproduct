import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const socket = io(URL, {
  autoConnect: false, // We will connect manually when needed
});

/** Connect with the host JWT so the server can authorize host actions. */
export const connectSocket = () => {
  socket.auth = { token: localStorage.getItem('token') || '' };
  if (!socket.connected) socket.connect();
};
