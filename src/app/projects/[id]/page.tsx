'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createChecksForItem } from '@/lib/checks';
import { useUser } from '@/components/UserContext';
import BottomNav from '@/components/BottomNav';
import DeadlineBadge from '@/components/DeadlineBadge';
import { getDeadlineInfo } from '@/lib/deadline';
import StopReasonPicker from '@/components/StopReasonPicker';
import ItemMergeDialog from '@/components/ItemMergeDialog';
import { WORKFLOW_STEPS, SUB_STEPS_12, CHECKS_PER_ITEM } from '@/lib/constants';
import type { Item, Check, User as AppUser } from '@/lib/types';

interface ProjectData {
  id: string;
  name: string;
  assignee_id: string;
  estimate_pdf_url: string | null;
  notify_days_before: number;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const router = useRouter();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [assigneeName, setAssigneeName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [reasonTarget, setReasonTarget] = useState<{ check: Check; itemName: string } | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDeadline, setNewItemDeadline] = useState('');
  const [editingNotify, setEditingNotify] = useState(false);
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [sub12Expanded, setSub12Expanded] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState<string | null>(null);
  const [editingItemDeadline, setEditingItemDeadline] = useState<string | null>(null);
  const [tempItemName, setTempItemName] = useState('');
  const [tempItemDeadline, setTempItemDeadline] = useState('');

  const loadProject = useCallback(async () => {
    // 全クエリを並列実行（4→1ラウンドトリップ）
    const [projRes, usersRes, itemsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*, users!projects_assignee_id_fkey(name)')
        .eq('id', id)
        .single(),
      supabase.from('users').select('id, name').order('name'),
      supabase
        .from('items')
        .select('*, checks(*)')
        .eq('project_id', id)
        .is('merged_into_id', null)
        .order('deadline'),
    ]);

    if (!projRes.data) return;

    const proj = projRes.data;
    const assigneeUser = proj.users as { name: string } | null;

    setProject(proj);
    setAssigneeName(assigneeUser?.name || '未割当');
    setAllUsers(usersRes.data || []);
    setItems(itemsRes.data || []);
    setLoading(false);
  }, [id]);

  // Debounced realtime reload
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadProject(), 500);
  }, [loadProject]);

  useEffect(() => {
    if (!user) {
      router.replace('/');
      return;
    }
    loadProject();

    const channel = supabase
      .channel(`project-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checks' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${id}` }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, debouncedReload)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, router, loadProject, debouncedReload, id]);

  // Calculate totals
  const totalChecks = items.reduce((sum, item) => sum + (item.checks?.length || 0), 0);
  const checkedCount = items.reduce(
    (sum, item) => sum + (item.checks?.filter((c) => c.checked).length || 0),
    0
  );
  const progress = totalChecks > 0 ? Math.round((checkedCount / totalChecks) * 100) : 0;

  async function toggleCheck(check: Check) {
    if (!user) return;
    const newChecked = !check.checked;
    await supabase
      .from('checks')
      .update({
        checked: newChecked,
        checked_at: newChecked ? new Date().toISOString() : null,
        checked_by: newChecked ? user.id : null,
        stop_reason: newChecked ? null : check.stop_reason,
      })
      .eq('id', check.id);

    // Update local state
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        checks: item.checks?.map((c) =>
          c.id === check.id
            ? {
                ...c,
                checked: newChecked,
                checked_at: newChecked ? new Date().toISOString() : null,
                checked_by: newChecked ? user.id : null,
                stop_reason: newChecked ? null : c.stop_reason,
              }
            : c
        ),
      }))
    );
  }

  async function handleStopReason(reason: string | null) {
    if (!reasonTarget) return;
    await supabase
      .from('checks')
      .update({ stop_reason: reason })
      .eq('id', reasonTarget.check.id);

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        checks: item.checks?.map((c) =>
          c.id === reasonTarget.check.id ? { ...c, stop_reason: reason } : c
        ),
      }))
    );
    setReasonTarget(null);
  }

  async function addNewItem() {
    if (!project || !newItemName.trim() || !newItemDeadline) return;
    const { data: newItem } = await supabase
      .from('items')
      .insert({
        project_id: project.id,
        name: newItemName.trim(),
        deadline: newItemDeadline,
      })
      .select()
      .single();

    if (newItem) {
      await createChecksForItem(newItem.id);
      setNewItemName('');
      setNewItemDeadline('');
      setAddingItem(false);
      await loadProject();
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm('この明細を削除しますか？')) return;
    await supabase.from('checks').delete().eq('item_id', itemId);
    await supabase.from('items').delete().eq('id', itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function handleMerge(selectedIds: string[], newName: string, newDeadline: string) {
    if (!project) return;

    // Create new merged item
    const { data: newItem } = await supabase
      .from('items')
      .insert({
        project_id: project.id,
        name: newName,
        deadline: newDeadline,
      })
      .select()
      .single();

    if (!newItem) return;
    await createChecksForItem(newItem.id);

    // Mark selected items as merged
    await supabase
      .from('items')
      .update({ merged_into_id: newItem.id })
      .in('id', selectedIds);

    setShowMerge(false);
    await loadProject();
  }

  async function updateNotifyDays(days: number) {
    if (!project) return;
    await supabase
      .from('projects')
      .update({ notify_days_before: days })
      .eq('id', project.id);
    setProject({ ...project, notify_days_before: days });
    setEditingNotify(false);
  }

  async function updateAssignee(newAssigneeId: string) {
    if (!project) return;
    await supabase
      .from('projects')
      .update({ assignee_id: newAssigneeId })
      .eq('id', project.id);
    const newUser = allUsers.find((u) => u.id === newAssigneeId);
    setProject({ ...project, assignee_id: newAssigneeId });
    setAssigneeName(newUser?.name || '');
    setEditingAssignee(false);
  }

  async function updateItemName(itemId: string, newName: string) {
    if (!newName.trim()) return;
    await supabase.from('items').update({ name: newName.trim() }).eq('id', itemId);
    setItems(items.map((i) => i.id === itemId ? { ...i, name: newName.trim() } : i));
    setEditingItemName(null);
  }

  async function updateItemDeadline(itemId: string, newDeadline: string) {
    if (!newDeadline) return;
    await supabase.from('items').update({ deadline: newDeadline }).eq('id', itemId);
    setItems(items.map((i) => i.id === itemId ? { ...i, deadline: newDeadline } : i));
    setEditingItemDeadline(null);
  }

  if (!user) return null;

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">{loading ? '' : '案件が見つかりません'}</div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/projects')} className="text-xl">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{project.name}</h1>
            <div className="flex items-center gap-3 text-xs text-blue-200">
              <span>進捗 {checkedCount}/{totalChecks}（{progress}%）</span>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 w-full bg-blue-800 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-white transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Project info */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {/* Assignee */}
          <div className="flex items-center gap-1">
            <span className="text-gray-500">担当：</span>
            {editingAssignee ? (
              <select
                value={project.assignee_id}
                onChange={(e) => updateAssignee(e.target.value)}
                onBlur={() => setEditingAssignee(false)}
                autoFocus
                className="border rounded px-2 py-1 text-sm"
              >
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setEditingAssignee(true)}
                className="font-medium text-blue-600"
              >
                {assigneeName}
              </button>
            )}
          </div>

          {/* Notification */}
          <div className="flex items-center gap-1">
            <span className="text-gray-500">通知：</span>
            {editingNotify ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={project.notify_days_before}
                  onBlur={(e) => updateNotifyDays(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') updateNotifyDays(Number((e.target as HTMLInputElement).value));
                  }}
                  autoFocus
                  className="w-14 border rounded px-2 py-1 text-sm text-center"
                />
                <span className="text-xs">日前</span>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotify(true)}
                className="font-medium text-blue-600"
              >
                期限{project.notify_days_before}日前
              </button>
            )}
          </div>

          {/* PDF link */}
          {project.estimate_pdf_url && (
            <a
              href={project.estimate_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 font-medium"
            >
              見積PDF →
            </a>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 flex gap-2">
        <button
          onClick={() => setAddingItem(true)}
          className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium active:bg-blue-100"
        >
          ＋ 明細追加
        </button>
        {items.length >= 2 && (
          <button
            onClick={() => setShowMerge(true)}
            className="flex-1 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-medium active:bg-gray-100"
          >
            統合
          </button>
        )}
      </div>

      {/* Add item form */}
      {addingItem && (
        <div className="mx-4 mb-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
          <input
            type="text"
            placeholder="明細名"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm mb-2"
          />
          <input
            type="date"
            value={newItemDeadline}
            onChange={(e) => setNewItemDeadline(e.target.value)}
            className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setAddingItem(false)}
              className="flex-1 py-2 bg-gray-200 rounded-lg text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={addNewItem}
              disabled={!newItemName.trim() || !newItemDeadline}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
            >
              追加
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="px-4 space-y-3 pb-4">
        {items.map((item) => {
          const itemChecks = item.checks || [];
          const itemChecked = itemChecks.filter((c) => c.checked).length;
          const itemTotal = itemChecks.length;
          const itemProgress = itemTotal > 0 ? Math.round((itemChecked / itemTotal) * 100) : 0;
          const isExpanded = expandedItem === item.id;

          // Get main steps (1-11)
          const mainChecks = itemChecks
            .filter((c) => c.step_number <= 11)
            .sort((a, b) => a.step_number - b.step_number);

          // Get step 12 sub-checks
          const step12Checks = itemChecks
            .filter((c) => c.step_number === 12)
            .sort((a, b) => (a.sub_step || 0) - (b.sub_step || 0));

          const step12AllChecked = step12Checks.every((c) => c.checked);
          const step12CheckedCount = step12Checks.filter((c) => c.checked).length;
          const is12Expanded = sub12Expanded === item.id;

          const deadlineInfo = (() => {
            try {
              return getDeadlineInfo(item.deadline);
            } catch {
              return { days: 0, color: 'gray' as const, label: '期限未設定', overdue: false };
            }
          })();
          const isEditingName = editingItemName === item.id;
          const isEditingDeadline = editingItemDeadline === item.id;

          // 今日の日付と1年後
          const todayStr = new Date().toISOString().split('T')[0];
          const maxDate = new Date();
          maxDate.setFullYear(maxDate.getFullYear() + 1);
          const maxDateStr = maxDate.toISOString().split('T')[0];

          return (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative mt-2">
              {/* Badge: iPhone通知スタイル（枠内右上に収める） */}
              {(deadlineInfo.overdue || deadlineInfo.color === 'red' || deadlineInfo.color === 'yellow') && (
                <div className={`absolute top-2 right-2 z-10 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${
                  deadlineInfo.overdue || deadlineInfo.color === 'red' ? 'bg-red-500' : 'bg-yellow-500'
                }`}>
                  {deadlineInfo.overdue ? `${deadlineInfo.days}日超過` : deadlineInfo.label}
                </div>
              )}

              {/* Item header - タップでチェックリスト開閉 */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                className="w-full text-left p-4 active:bg-gray-50 cursor-pointer"
              >
                {/* Item name + 鉛筆アイコン */}
                <div className="flex items-start mb-2 pr-16">
                  {isEditingName ? (
                    <input
                      autoFocus
                      value={tempItemName}
                      onChange={(e) => setTempItemName(e.target.value)}
                      onBlur={() => updateItemName(item.id, tempItemName)}
                      onKeyDown={(e) => { if (e.key === 'Enter') updateItemName(item.id, tempItemName); }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-sm font-bold border-b-2 border-blue-500 outline-none py-0.5"
                    />
                  ) : (
                    <>
                      <span className="font-bold text-sm flex-1">{item.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingItemName(item.id);
                          setTempItemName(item.name);
                        }}
                        className="ml-1 text-gray-400 active:text-blue-500 p-1 shrink-0"
                      >
                        <span className="text-xs">✏️</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Deadline + Progress */}
                <div className="flex items-center gap-2 mb-1">
                  {isEditingDeadline ? (
                    <input
                      type="date"
                      autoFocus
                      min={todayStr}
                      max={maxDateStr}
                      value={tempItemDeadline}
                      onChange={(e) => {
                        setTempItemDeadline(e.target.value);
                        updateItemDeadline(item.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs border border-blue-400 rounded px-2 py-1"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItemDeadline(item.id);
                        setTempItemDeadline(item.deadline);
                      }}
                      className={`text-xs px-2 py-1 rounded border ${
                        item.deadline ? 'border-gray-200 text-gray-600' : 'border-red-300 text-red-500 bg-red-50'
                      }`}
                    >
                      {item.deadline ? `期限: ${new Date(item.deadline).toLocaleDateString('ja-JP')}` : '期限を設定'}
                    </button>
                  )}
                  <span className="text-xs text-gray-400">
                    {!deadlineInfo.overdue && deadlineInfo.color === 'gray' && deadlineInfo.label}
                    {!deadlineInfo.overdue && deadlineInfo.color === 'green' && deadlineInfo.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        itemProgress >= 80 ? 'bg-green-500' : itemProgress >= 30 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${itemProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">{itemChecked}/{itemTotal}</span>
                  <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Stop reasons summary */}
                {!isExpanded && itemChecks.some((c) => c.stop_reason) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {itemChecks
                      .filter((c) => c.stop_reason)
                      .slice(0, 3)
                      .map((c) => (
                        <span
                          key={c.id}
                          className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-[10px]"
                        >
                          {c.stop_reason}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Expanded checklist */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  {/* Steps 1-11 */}
                  {mainChecks.map((check) => {
                    const step = WORKFLOW_STEPS.find((s) => s.number === check.step_number);
                    return (
                      <div key={check.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50">
                        <button
                          onClick={() => toggleCheck(check)}
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            check.checked
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 active:border-green-400'
                          }`}
                        >
                          {check.checked ? '✓' : ''}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${check.checked ? 'text-gray-400 line-through' : ''}`}>
                            {toCircled(check.step_number)}{step?.label}
                          </span>
                          {check.checked && check.checked_at && (
                            <span className="text-[10px] text-gray-400 ml-2">
                              {new Date(check.checked_at).toLocaleDateString('ja-JP')}
                            </span>
                          )}
                          {check.stop_reason && !check.checked && (
                            <span className="inline-block ml-2 px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-[10px]">
                              🏷️ {check.stop_reason}
                            </span>
                          )}
                        </div>
                        {!check.checked && (
                          <button
                            onClick={() => setReasonTarget({ check, itemName: item.name })}
                            className="text-[11px] text-gray-400 px-1.5 py-0.5 rounded active:bg-gray-100 shrink-0"
                          >
                            理由
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Step 12 - expandable */}
                  <div className="py-2.5">
                    <button
                      onClick={() => setSub12Expanded(is12Expanded ? null : item.id)}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      <div
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          step12AllChecked
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {step12AllChecked ? '✓' : ''}
                      </div>
                      <span className={`text-sm flex-1 ${step12AllChecked ? 'text-gray-400 line-through' : ''}`}>
                        ⑫現場確認（{step12CheckedCount}/{step12Checks.length}）
                      </span>
                      <span className="text-xs text-gray-400">{is12Expanded ? '▲' : '▼'}</span>
                    </button>

                    {is12Expanded && (
                      <div className="ml-10 mt-2 space-y-1">
                        {step12Checks.map((check) => {
                          const sub = SUB_STEPS_12.find((s) => s.subStep === check.sub_step);
                          return (
                            <div key={check.id} className="flex items-center gap-2 py-1.5">
                              <button
                                onClick={() => toggleCheck(check)}
                                className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 text-xs transition-colors ${
                                  check.checked
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 active:border-green-400'
                                }`}
                              >
                                {check.checked ? '✓' : ''}
                              </button>
                              <span className={`text-sm flex-1 ${check.checked ? 'text-gray-400 line-through' : ''}`}>
                                {sub?.label}
                              </span>
                              {check.stop_reason && !check.checked && (
                                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-[10px]">
                                  {check.stop_reason}
                                </span>
                              )}
                              {!check.checked && (
                                <button
                                  onClick={() => setReasonTarget({ check, itemName: item.name })}
                                  className="text-[11px] text-gray-400 px-1 shrink-0"
                                >
                                  理由
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="mt-2 w-full py-2 text-sm text-red-400 rounded-lg active:bg-red-50"
                  >
                    この明細を削除
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialogs */}
      {reasonTarget && (
        <StopReasonPicker
          currentReason={reasonTarget.check.stop_reason}
          onSelect={handleStopReason}
          onClose={() => setReasonTarget(null)}
        />
      )}

      {showMerge && (
        <ItemMergeDialog
          items={items}
          onMerge={handleMerge}
          onClose={() => setShowMerge(false)}
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
