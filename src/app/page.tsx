'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/components/UserContext';
import type { User } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const { user, setUser, isLoading } = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/projects');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    supabase
      .from('users')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setUsers(data || []);
        setLoadingUsers(false);
      });
  }, []);

  function handleSelect(selectedUser: User) {
    setUser({ ...selectedUser });
    router.replace('/projects');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-gray-800 mb-2">工事チェック</h1>
        <p className="text-sm text-center text-gray-500 mb-8">名前を選択してログイン</p>

        {loadingUsers ? (
          <div className="text-center text-gray-400 py-8">読み込み中...</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelect(u)}
                className="py-4 px-2 bg-white border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-700 active:bg-blue-50 active:border-blue-400 transition-colors shadow-sm"
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
