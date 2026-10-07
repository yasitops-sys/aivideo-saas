import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, type Me } from '../lib/api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get<{ user: Me }>('/api/auth/me');
      setMe(data.user);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    await api.post<{ user: Me }>('/api/auth/login', { email, password });
    await fetchMe();
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* already logged out */
    }
    setMe(null);
  };

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

const isAdminRole = (role?: string) => role === 'admin' || role === 'super_admin';

/** Guards every admin route. Non-admins (incl. customers) get an access-denied screen. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!me) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdminRole(me.role)) {
    // A customer somehow reached the admin app: show denial, then log out.
    void logout();
    return <Navigate to="/admin/access-denied" replace />;
  }

  return <>{children}</>;
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (me && me.role !== 'super_admin') {
    return <Navigate to="/admin/access-denied" replace />;
  }
  return <>{children}</>;
}
