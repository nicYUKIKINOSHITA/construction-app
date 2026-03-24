'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as User;
        // Verify user still exists in DB
        supabase
          .from('users')
          .select('id, name')
          .eq('id', parsed.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setUserState(data as User);
            } else {
              localStorage.removeItem('currentUser');
            }
            setLoaded(true);
          });
        return;
      } catch {
        localStorage.removeItem('currentUser');
      }
    }
    setLoaded(true);
  }, []);

  const setUser = (u: User | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem('currentUser', JSON.stringify(u));
    } else {
      localStorage.removeItem('currentUser');
    }
  };

  const logout = () => {
    setUser(null);
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user, setUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
