'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import DeadlineBadge from '@/components/DeadlineBadge';
import StopReasonPicker from '@/components/StopReasonPicker';
import { WORKFLOW_STEPS, SUB_STEPS_12 } from '@/lib/constants';

interface TaskItem {
  check_id: string;
  item_id: string;
  item_name: string;
  project_id: string;
  project_name: string;
  deadline: string;
  step_number: number;
  sub_step: number | null;
  stop_reason: string | null;
}

export default function MyTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonTarget, setReasonTarget] = useState<TaskItem | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    // Get all projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name');

    if (!projects || projects.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const projectIds = projects.map((p) => p.id);

    // Get active items
    const { data: items } = await supabase
      .from('items')
      .select('id, name, deadline, project_id')
      .in('project_id', projectIds)
      .is('merged_into_id', null);

    if (!items || items.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const itemIds = items.map((i) => i.id);
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Get unchecked checks
    const { data: checks } = await supabase
      .from('checks')
      .select('id, item_id, step_number, sub_step, stop_reason')
      .in('item_id', itemIds)
      .eq('checked', false);

    const taskList: TaskItem[] = (checks || []).map((c) => {
      const item = itemMap.get(c.item_id)!;
      return {
        check_id: c.id,
        item_id: c.item_id,
        item_name: item.name,
        project_id: item.project_id,
        project_name: projectMap.get(item.project_id) || '',
        deadline: item.deadline,
        step_number: c.step_number,
        sub_step: c.sub_step,
        stop_reason: c.stop_reason,
      };
    });

    taskList.sort((a, b) => {
      if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
      if (a.step_number !== b.step_number) return a.step_number - b.step_number;
      return (a.sub_step || 0) - (b.sub_step || 0);
    });

    setTasks(taskList);
    setLoading(false);
  }

  async function handleCheck(task: TaskItem) {
    await supabase
      .from('checks')
      .update({
        checked: true,
        checked_at: new Date().toISOString(),
        checked_by: null,
        stop_reason: null,
      })
      .eq('id', task.check_id);

    setTasks((prev) => prev.filter((t) => t.check_id !== task.check_id));
  }

  async function handleStopReason(reason: string | null) {
    if (!reasonTarget) return;
    await supabase
      .from('checks')
      .update({ stop_reason: reason })
      .eq('id', reasonTarget.check_id);

    setTasks((prev) =>
      prev.map((t) =>
        t.check_id === reasonTarget.check_id ? { ...t, stop_reason: reason } : t
      )
    );
    setReasonTarget(null);
  }

  function getStepLabel(stepNumber: number, subStep: number | null) {
    if (stepNumber === 12 && subStep !== null) {
      const sub = SUB_STEPS_12.find((s) => s.subStep === subStep);
      return `⑫ ${sub?.label || ''}`;
    }
    const step = WORKFLOW_STEPS.find((s) => s.number === stepNumber);
    return `${toCircled(stepNumber)}${step?.label || ''}`;
  }

  // Group by project
  const grouped = new Map<string, TaskItem[]>();
  tasks.forEach((t) => {
    const key = t.project_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  });

  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40">
        <h1 className="text-lg font-bold">全タスク</h1>
        <p className="text-xs text-blue-200">未完了: {tasks.length}件</p>
      </header>

      <div className="p-4">
        {loading ? (
          <div className="text-center text-gray-400 py-12">読み込み中...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-2xl mb-2">👍</p>
            <p className="text-gray-500">すべて完了しています</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([projectId, projectTasks]) => (
              <div key={projectId}>
                <h2
                  className="text-sm font-bold text-gray-600 mb-2 cursor-pointer"
                  onClick={() => router.push(`/projects/${projectId}`)}
                >
                  {projectTasks[0].project_name}
                </h2>
                <div className="space-y-2">
                  {projectTasks.map((task) => (
                    <div
                      key={task.check_id}
                      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => handleCheck(task)}
                          className="mt-0.5 w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0 active:bg-green-100 active:border-green-500"
                        >
                          <span className="text-transparent">✓</span>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium truncate">{task.item_name}</span>
                            <DeadlineBadge deadline={task.deadline} />
                          </div>
                          <div className="text-xs text-gray-600">
                            {getStepLabel(task.step_number, task.sub_step)}
                          </div>
                          {task.stop_reason && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-600 rounded text-[11px]">
                              🏷️ {task.stop_reason}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setReasonTarget(task)}
                          className="shrink-0 text-xs text-gray-400 px-2 py-1 rounded active:bg-gray-100"
                        >
                          理由
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reasonTarget && (
        <StopReasonPicker
          currentReason={reasonTarget.stop_reason}
          onSelect={handleStopReason}
          onClose={() => setReasonTarget(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

function toCircled(n: number): string {
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
  return circled[n - 1] || `(${n})`;
}
