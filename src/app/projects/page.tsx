'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
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
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    // 1. Fetch all projects with assignee name in ONE query
    const { data: projectsData, error: projErr } = await supabase
      .from('projects')
      .select('id, name, assignee_id, estimate_pdf_url, notify_days_before, created_at, users!projects_assignee_id_fkey(name)')
      .order('created_at', { ascending: false });

    if (projErr || !projectsData) {
      setError('案件の読み込みに失敗しました');
      setLoading(false);
      return;
    }

    if (projectsData.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const projectIds = projectsData.map((p: { id: string }) => p.id);

    // 2. Fetch items with check counts in ONE query using join
    const { data: allItems } = await supabase
      .from('items')
      .select('id, project_id, name, deadline, checks(checked)')
      .in('project_id', projectIds)
      .is('merged_into_id', null)
      .order('deadline');

    // 3. Aggregate counts from joined data (no extra query needed)
    const enriched: Project[] = projectsData.map((p: Record<string, unknown>) => {
      const projItems = (allItems || []).filter((i) => i.project_id === (p.id as string));
      let totalChecks = 0;
      let checkedChecks = 0;
      for (const item of projItems) {
        const checks = (item as unknown as { checks: { checked: boolean }[] }).checks || [];
        totalChecks += checks.length;
        checkedChecks += checks.filter((c) => c.checked).length;
      }
      const users = p.users as { name: string } | null;

      return {
        ...p,
        assignee_name: users?.name || '未割当',
        checked_count: checkedChecks,
        total_count: totalChecks,
        earliest_deadline: projItems[0]?.deadline || null,
        urgent_items: [],
      } as unknown as Project;
    });

    setProjects(enriched);
    setError('');
    setLoading(false);
  }, []);

  // Debounced reload for realtime events
  const debouncedReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadProjects();
    }, 500);
  }, [loadProjects]);

  useEffect(() => {
    if (!user) {
      router.replace('/');
      return;
    }
    loadProjects();

    const channel = supabase
      .channel('projects-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checks' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, debouncedReload)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, router, loadProjects, debouncedReload]);

  if (!user) return null;

  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-blue-600 text-white px-3 py-2 z-40">
        <h1 className="text-base font-bold">案件一覧</h1>
      </header>

      <div className="p-2 space-y-1.5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={loadProjects} className="block mt-1 text-blue-600 underline">再読み込み</button>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-12">読み込み中...</div>
        ) : projects.length === 0 && !error ? (
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

      <Link
        href="/projects/new"
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg text-2xl flex items-center justify-center active:bg-blue-700 z-40"
        aria-label="案件を追加"
        prefetch={true}
      >
        +
      </Link>

      <BottomNav />
    </div>
  );
}
