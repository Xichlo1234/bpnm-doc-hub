import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, authStorage, TOKEN_KEY } from '../services/api.ts';

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user' | 'editor';
  email: string;
  department?: string | null;
  status?: 'active' | 'locked';
  can_access_labor_contracts?: boolean;
  can_access_confidential_documents?: boolean;
  must_change_password?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => authStorage.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize: validate the stored token
  useEffect(() => {
    const existingToken = authStorage.getToken();

    if (!existingToken) {
      setIsLoading(false);
      return;
    }

    api
      .getMe()
      .then((res) => {
        setUser(res.user);
        setToken(existingToken);
      })
      .catch(() => {
        // Token invalid or expired
        authStorage.setToken(null);
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Listen for auth expiration events
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setToken(null);
    };

    // The server refused a call because this account must change its password first
    const handlePasswordChangeRequired = () => {
      setUser((current) => (current ? { ...current, must_change_password: true } : current));
    };

    window.addEventListener('auth:expired', handleExpired);
    window.addEventListener('auth:password-change-required', handlePasswordChangeRequired);
    return () => {
      window.removeEventListener('auth:expired', handleExpired);
      window.removeEventListener('auth:password-change-required', handlePasswordChangeRequired);
    };
  }, []);

  // Re-read the session when another tab logs in or out (all tabs share the stored token)
  useEffect(() => {
    const refresh = () => {
      if (!authStorage.getToken()) {
        setUser(null);
        setToken(null);
        return;
      }
      api
        .getMe()
        .then((res) => {
          setUser(res.user);
          setToken(authStorage.getToken());
        })
        .catch(() => {
          setUser(null);
          setToken(null);
        });
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKEN_KEY) refresh();
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // No global isLoading here: it would swap LoginView for the loading screen, unmounting the form
  // and losing its error message and inputs. LoginView shows its own submitting state.
  const login = async (username: string, password: string) => {
    const res = await api.login(username, password);
    setUser(res.user);
    setToken(res.token);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await api.changePassword(currentPassword, newPassword);
    setUser(res.user);
    setToken(res.token);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      authStorage.setToken(null);
      setUser(null);
      setToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
