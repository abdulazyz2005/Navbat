import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '@navbat/shared';
import { ApiError, api, authenticate, getToken } from '../lib/api';
import { initTelegram } from '../lib/telegram';

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setRoleMode: (mode: 'BUYER' | 'WORKER' | 'BOTH') => Promise<void>;
  completeOnboarding: (mode: 'BUYER' | 'WORKER' | 'BOTH') => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Serverga ulanib bo‘lmadi');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      initTelegram();
      try {
        if (!getToken()) await authenticate();
        const profile = await api.me();
        if (!cancelled) {
          setMe(profile);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Serverga ulanib bo‘lmadi. Internetni tekshiring.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setRoleMode = useCallback(
    async (mode: 'BUYER' | 'WORKER' | 'BOTH') => {
      await api.updateMe({ roleMode: mode });
      await refresh();
    },
    [refresh],
  );

  const completeOnboarding = useCallback(
    async (mode: 'BUYER' | 'WORKER' | 'BOTH') => {
      await api.updateMe({ roleMode: mode, onboarded: true });
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthState>(
    () => ({ me, loading, error, refresh, setRoleMode, completeOnboarding }),
    [me, loading, error, refresh, setRoleMode, completeOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return context;
}

/** Hozirgi rejim: buyurtmachi yoki navbatchi (BOTH bo'lganda almashtiriladi) */
const MODE_KEY = 'navbat.mode';

export function useViewMode(): ['BUYER' | 'WORKER', (mode: 'BUYER' | 'WORKER') => void] {
  const { me } = useAuth();
  const [mode, setMode] = useState<'BUYER' | 'WORKER'>(() => {
    const stored = sessionStorage.getItem(MODE_KEY);
    return stored === 'WORKER' ? 'WORKER' : 'BUYER';
  });

  useEffect(() => {
    if (!me) return;
    if (me.profile.roleMode === 'WORKER' && mode !== 'WORKER') setMode('WORKER');
    if (me.profile.roleMode === 'BUYER' && mode !== 'BUYER') setMode('BUYER');
  }, [me, mode]);

  const update = useCallback((next: 'BUYER' | 'WORKER') => {
    sessionStorage.setItem(MODE_KEY, next);
    setMode(next);
  }, []);

  return [mode, update];
}
