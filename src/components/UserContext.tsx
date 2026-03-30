'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import type { User } from '@/lib/types';

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

// Provide a dummy user so all pages work without login
const DUMMY_USER: User = { id: 'shared', name: '共有' };

const UserContext = createContext<UserContextType>({
  user: DUMMY_USER,
  setUser: () => {},
  logout: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({
    user: DUMMY_USER,
    setUser: () => {},
    logout: () => {},
  }), []);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
