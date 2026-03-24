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
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      router.replace('/projects');
      return;
    }
    const fetchUsers = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .order('name');
        if (fetchError) {
          console.error('Supabase error:', fetchError);
          setError(`接続エラー: ${fetchError.message}`);
        }
        setUsers(data || []);
      } catch (err) {
        console.error('Network error:', err);
        setError('サーバーに接続できません。ページを再読み込みしてください。');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
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

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button
              onClick={() => window.location.reload()}
              className="block mt-2 text-blue-600 underline"
            >
              再読み込み
            </button>
          </div>
        )}

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
