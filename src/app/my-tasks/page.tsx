'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/components/UserContext';
import BottomNav from '@/components/BottomNav';
import type { PersonalTask, User } from '@/lib/types';

interface TaskWithUser extends PersonalTask {
  user_name: string;
}

export default function MyTasksPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const [tasks, setTasks] = useState<TaskWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const isAdmin = user?.name === '社長' || user?.name === '専務';

  const loadTasks = useCallback(async () => {
    if (!user) return;

    if (isAdmin) {
      // Admin sees all tasks grouped by user
      const { data: tasksData } = await supabase
        .from('personal_tasks')
        .select('*, users!personal_tasks_user_id_fkey(name)')
        .order('created_at', { ascending: true });

      const mapped: TaskWithUser[] = (tasksData || []).map((t: Record<string, unknown>) => {
        const users = t.users as { name: string } | null;
        return {
          id: t.id as string,
          user_id: t.user_id as string,
          title: t.title as string,
          created_at: t.created_at as string,
          user_name: users?.name || '',
        };
      });
      setTasks(mapped);
    } else {
      // Regular user sees only their own tasks
      const { data: tasksData } = await supabase
        .from('personal_tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      const mapped: TaskWithUser[] = (tasksData || []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        user_id: t.user_id as string,
        title: t.title as string,
        created_at: t.created_at as string,
        user_name: user.name,
      }));
      setTasks(mapped);
    }

    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace('/');
      return;
    }
    if (user) {
      loadTasks();
    }
  }, [user, userLoading, loadTasks, router]);

  async function handleAdd() {
    if (!user || !newTitle.trim() || adding) return;
    setAdding(true);

    const { data } = await supabase
      .from('personal_tasks')
      .insert({ user_id: user.id, title: newTitle.trim() })
      .select()
      .single();

    if (data) {
      const newTask: TaskWithUser = {
        ...data,
        user_name: user.name,
      };
      setTasks((prev) => [...prev, newTask]);
    }
    setNewTitle('');
    setAdding(false);
  }

  async function handleComplete(taskId: string) {
    await supabase.from('personal_tasks').delete().eq('id', taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  if (userLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  // Group tasks by user name for admin view
  const grouped = new Map<string, TaskWithUser[]>();
  for (const task of tasks) {
    const key = task.user_name;
    const existing = grouped.get(key) || [];
    grouped.set(key, [...existing, task]);
  }

  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40">
        <h1 className="text-lg font-bold">マイタスク</h1>
        <p className="text-xs text-blue-200">
          {isAdmin ? `全員のタスク: ${tasks.length}件` : `${tasks.length}件`}
        </p>
      </header>

      {/* Add task form */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="タスクを追加..."
            className="flex-1 py-2 px-3 border border-gray-200 rounded-lg text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={!newTitle.trim() || adding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 active:bg-blue-700 shrink-0"
          >
            追加
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-center text-gray-400 py-12">読み込み中...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-2xl mb-2">👍</p>
            <p className="text-gray-500">タスクはありません</p>
          </div>
        ) : isAdmin ? (
          // Admin: grouped by user
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([userName, userTasks]) => (
              <div key={userName}>
                <h2 className="text-sm font-bold text-gray-600 mb-2">{userName}</h2>
                <div className="space-y-2">
                  {userTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleComplete(task.id)}
                          className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0 active:bg-green-100 active:border-green-500"
                        >
                          <span className="text-transparent">&#10003;</span>
                        </button>
                        <span className="text-sm flex-1">{task.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Regular user: flat list
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0 active:bg-green-100 active:border-green-500"
                  >
                    <span className="text-transparent">&#10003;</span>
                  </button>
                  <span className="text-sm flex-1">{task.title}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
