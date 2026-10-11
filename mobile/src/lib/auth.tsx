import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { api, configureApi } from './api';
import { storage } from './storage';
import type { User } from './types';

const TOKEN_KEY = 'diary.token';
const USER_KEY = 'diary.user';
const SERVER_KEY = 'diary.server';

/**
 * Where the backend lives. EXPO_PUBLIC_API_URL wins; otherwise, in development, assume the API
 * runs on port 8000 of the same machine that serves the Expo bundle (works for phones on your LAN).
 */
export function defaultServerUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:8000`;
}

type AuthContextValue = {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  serverUrl: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [serverUrl, setServerUrlState] = useState(defaultServerUrl());
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => {
    onSignOutRef.current = onSignOut;
  }, [onSignOut]);

  const signOut = useCallback(async () => {
    await Promise.all([storage.remove(TOKEN_KEY), storage.remove(USER_KEY)]);
    configureApi({ token: null });
    setUser(null);
    setStatus('signedOut');
    onSignOutRef.current?.();
  }, []);

  useEffect(() => {
    configureApi({ onUnauthorized: () => void signOut() });
  }, [signOut]);

  useEffect(() => {
    (async () => {
      const [token, userJson, savedServer] = await Promise.all([
        storage.get(TOKEN_KEY),
        storage.get(USER_KEY),
        storage.get(SERVER_KEY),
      ]);
      const server = savedServer || defaultServerUrl();
      setServerUrlState(server);
      configureApi({ baseUrl: server, token });
      if (token && userJson) {
        setUser(JSON.parse(userJson));
        setStatus('signedIn');
        api.me().then(
          (fresh) => {
            setUser(fresh);
            storage.set(USER_KEY, JSON.stringify(fresh));
          },
          () => {}, // offline is fine; a 401 signs out via onUnauthorized
        );
      } else {
        setStatus('signedOut');
      }
    })();
  }, []);

  const finish = useCallback(async ({ token, user: u }: { token: string; user: User }) => {
    await Promise.all([storage.set(TOKEN_KEY, token), storage.set(USER_KEY, JSON.stringify(u))]);
    configureApi({ token });
    setUser(u);
    setStatus('signedIn');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      serverUrl,
      signIn: async (email, password) => finish(await api.login(email.trim(), password)),
      signUp: async (name, email, password) => finish(await api.register(name.trim(), email.trim(), password)),
      signOut,
      setServerUrl: async (url) => {
        const clean = url.trim().replace(/\/$/, '');
        await storage.set(SERVER_KEY, clean);
        configureApi({ baseUrl: clean });
        setServerUrlState(clean);
      },
    }),
    [status, user, serverUrl, finish, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
