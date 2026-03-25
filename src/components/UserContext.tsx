'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/types';

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  logout: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('currentUser');
    } catch {
      // Safari private browsing may throw
    }

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as User;
        const verifyUser = async () => {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('id, name')
              .eq('id', parsed.id)
              .single();
            if (data && !error) {
              setUserState(data as User);
            } else {
              try { localStorage.removeItem('currentUser'); } catch { /* noop */ }
            }
          } catch {
            try { localStorage.removeItem('currentUser'); } catch { /* noop */ }
          } finally {
            setLoaded(true);
          }
        };
        verifyUser();
        return;
      } catch {
        try { localStorage.removeItem('currentUser'); } catch { /* noop */ }
      }
    }
    setLoaded(true);
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    try {
      if (u) {
        localStorage.setItem('currentUser', JSON.stringify(u));
      } else {
        localStorage.removeItem('currentUser');
      }
    } catch { /* noop */ }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, [setUser]);

  const value = useMemo(() => ({ user, setUser, logout }), [user, setUser, logout]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400" role="status" aria-live="polite">読み込み中...</div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
