'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/components/UserContext';
import type { User } from '@/lib/types';

export default function LoginPage() {
  const { user, setUser } = useUser();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      router.replace('/projects');
      return;
    }
    supabase
      .from('users')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setUsers(data || []);
        setLoading(false);
      });
  }, [user, router]);

  if (user) return null;

  const handleSelect = (u: User) => {
    setUser(u);
    router.push('/projects');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">工事チェック</h1>
        <p className="text-gray-500 text-center mb-8 text-sm">名前を選択してログイン</p>

        {loading ? (
          <div className="text-center text-gray-400">読み込み中...</div>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelect(u)}
                className="w-full py-4 px-6 bg-white border border-gray-200 rounded-xl text-lg font-medium text-gray-800 active:bg-blue-50 active:border-blue-300 transition-colors shadow-sm"
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
