import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { User } from '../lib/api';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const loadMe = useCallback(async () => {
    try {
      const data = await api<{ user: User }>('/api/auth/me');
      if (mounted.current) setUser(data.user);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        if (mounted.current) setUser(null);
      } else {
        // network hiccup — keep previous state, but finish loading
        if (mounted.current) setUser((u) => u);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadMe();
    return () => {
      mounted.current = false;
    };
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    await api('/api/auth/login', { method: 'POST', json: { email, password } });
    const data = await api<{ user: User }>('/api/auth/me');
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, full_name: string) => {
      await api('/api/auth/register', {
        method: 'POST',
        json: { email, password, full_name },
      });
      // auto-login after registration for a smooth onboarding
      try {
        await api('/api/auth/login', { method: 'POST', json: { email, password } });
        const data = await api<{ user: User }>('/api/auth/me');
        setUser(data.user);
      } catch {
        /* user can log in manually */
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
