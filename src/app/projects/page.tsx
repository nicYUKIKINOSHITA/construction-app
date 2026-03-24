'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/components/UserContext';
import BottomNav from '@/components/BottomNav';
import ProjectCard from '@/components/ProjectCard';
import type { Project } from '@/lib/types';

export default function ProjectsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.replace('/');
      return;
    }
    loadProjects();
  }, [user, router]);

  async function loadProjects() {
    // Fetch projects with assignee name
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*, users!projects_assignee_id_fkey(name)')
      .order('created_at', { ascending: false });

    if (!projectsData) {
      setLoading(false);
      return;
    }

    // For each project, fetch progress and urgent items
    const enriched = await Promise.all(
      projectsData.map(async (p: Record<string, unknown>) => {
        // Get all active items for this project
        const { data: items } = await supabase
          .from('items')
          .select('id, name, deadline')
          .eq('project_id', p.id)
          .is('merged_into_id', null)
          .order('deadline');

        const itemIds = (items || []).map((i: { id: string }) => i.id);

        let checkedCount = 0;
        let totalCount = 0;

        if (itemIds.length > 0) {
          const { data: checks } = await supabase
            .from('checks')
            .select('checked')
            .in('item_id', itemIds);

          totalCount = checks?.length || 0;
          checkedCount = checks?.filter((c: { checked: boolean }) => c.checked).length || 0;
        }

        // Urgent items (sorted by deadline, top 3)
        const urgentItems = (items || []).slice(0, 3).map((item: { id: string; name: string; deadline: string }) => ({
          name: item.name,
          deadline: item.deadline,
          unchecked_count: 0,
        }));

        const users = p.users as { name: string } | null;

        return {
          ...p,
          assignee_name: users?.name || '未割当',
          checked_count: checkedCount,
          total_count: totalCount,
          earliest_deadline: items?.[0]?.deadline || null,
          urgent_items: urgentItems,
        } as Project;
      })
    );

    setProjects(enriched);
    setLoading(false);
  }

  if (!user) return null;

  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40">
        <h1 className="text-lg font-bold">案件一覧</h1>
      </header>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="text-center text-gray-400 py-12">読み込み中...</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>案件がありません</p>
            <p className="text-sm mt-1">右下の＋ボタンから登録</p>
          </div>
        ) : (
          projects.map((p) => (
            <ProjectCard
              key={p.id}
              id={p.id}
              name={p.name}
              assigneeName={p.assignee_name || ''}
              checkedCount={p.checked_count || 0}
              totalCount={p.total_count || 0}
              earliestDeadline={p.earliest_deadline || null}
              urgentItems={p.urgent_items || []}
            />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => router.push('/projects/new')}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg text-2xl flex items-center justify-center active:bg-blue-700 z-40"
      >
        +
      </button>

      <BottomNav />
    </div>
  );
}
