import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api, type SessionUser } from "./api";

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const body = await api<{ user: SessionUser }>("/api/auth/me");
      setUser(body.user);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("AuthProvider is missing");
  }
  return value;
}

export function can(user: SessionUser | null, permission?: string): boolean {
  if (!permission) {
    return true;
  }
  return Boolean(user?.permissions.includes(permission));
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <p className="p-8 text-stone-600">Checking your session…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { user } = useAuth();
  if (!can(user, permission)) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" role="alert">
        Your role cannot open this page.
      </p>
    );
  }
  return children;
}
