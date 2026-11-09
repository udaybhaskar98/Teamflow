import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, getStoredUser, getToken, storeSession } from "../lib/api";
import type { AuthResponse, AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function tokenIsExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialUser = useMemo(() => {
    const token = getToken();
    if (tokenIsExpired(token)) {
      storeSession(null);
      return null;
    }
    return getStoredUser();
  }, []);
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      storeSession(null);
      setUser(null);
    };
    window.addEventListener("teamflow:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("teamflow:unauthorized", handleUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        setLoading(true);
        try {
          const session: AuthResponse = await authApi.login({ email, password });
          storeSession(session);
          setUser(session.user);
        } finally {
          setLoading(false);
        }
      },
      register: async (name, email, password) => {
        setLoading(true);
        try {
          const session: AuthResponse = await authApi.register({ name, email, password });
          storeSession(session);
          setUser(session.user);
        } finally {
          setLoading(false);
        }
      },
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        storeSession(null);
        setUser(null);
      }
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
