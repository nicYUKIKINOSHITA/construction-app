'use client';

import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import type { User } from '@/lib/types';

const STORAGE_KEY = 'construction-app-user';

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  logout: () => {},
  isLoading: true,
});

function loadUserFromStorage(): User | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
      return { id: parsed.id, name: parsed.name };
    }
    return null;
  } catch {
    return null;
  }
}

function saveUserToStorage(user: User | null): void {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: user.id, name: user.name }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = loadUserFromStorage();
    if (stored) {
      setUserState(stored);
    }
    setIsLoading(false);
  }, []);

  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser);
    saveUserToStorage(newUser);
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
    saveUserToStorage(null);
  }, []);

  const value = useMemo(() => ({
    user,
    setUser,
    logout,
    isLoading,
  }), [user, setUser, logout, isLoading]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
