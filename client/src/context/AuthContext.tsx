import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

export type Role = 'SUPERADMIN' | 'SUBADMIN' | 'TENANT' | 'STAFF';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: Role;
  organizationId?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  /** True until the stored session has been checked against the server. */
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Read once, synchronously, before the first render.
 *
 * Restoring in an effect instead meant `isAuthenticated` was false on the first
 * pass, and React runs child effects before parent ones — so ProtectedRoute's
 * redirect fired before the token was ever loaded, and a refresh on any
 * dashboard page bounced a perfectly valid session to the login screen.
 */
const readStoredSession = (): { user: User | null; token: string | null } => {
  try {
    const token = localStorage.getItem('token');
    const raw = localStorage.getItem('user');
    if (!token || !raw) return { user: null, token: null };
    return { user: JSON.parse(raw) as User, token };
  } catch {
    // Corrupt JSON in storage should not take the whole app down.
    return { user: null, token: null };
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initial = readStoredSession();
  const [user, setUser] = useState<User | null>(initial.user);
  const [token, setToken] = useState<string | null>(initial.token);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(initial.token));

  // The stored user is a cache, not a source of truth — anyone can edit their
  // own localStorage. Confirm the session (and the real role) with the server.
  useEffect(() => {
    if (!initial.token) return;

    let cancelled = false;

    api
      .get('/auth/me')
      .then((response) => {
        if (cancelled) return;
        const fresh = response.data.user as User;
        setUser(fresh);
        localStorage.setItem('user', JSON.stringify(fresh));
      })
      .catch((error) => {
        // Only a rejected session clears it. A network blip or a 500 must not
        // sign the user out.
        const status = error?.response?.status;
        if (cancelled || (status !== 401 && status !== 403)) return;
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (userData: User, newToken: string) => {
    setUser(userData);
    setToken(newToken);
    setIsLoading(false);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsLoading(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated: !!token, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
