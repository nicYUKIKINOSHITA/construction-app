'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createChecksForItem } from '@/lib/checks';
import { useUser } from '@/components/UserContext';
import type { User } from '@/lib/types';

interface ItemInput {
  name: string;
  deadline: string;
}

export default function NewProjectPage() {
  const { user } = useUser();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [notifyDays, setNotifyDays] = useState(7);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [items, setItems] = useState<ItemInput[]>([{ name: '', deadline: '' }]);

  useEffect(() => {
    if (!user) {
      router.replace('/');
      return;
    }
    supabase
      .from('users')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setUsers(data || []);
      });
  }, [user, router]);

  const addItem = () => setItems([...items, { name: '', deadline: '' }]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemInput, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    if (!name.trim() || !assigneeId) return;

    const validItems = items.filter((i) => i.name.trim() && i.deadline);
    if (validItems.length === 0) return;

    setSaving(true);

    try {
      // Upload PDF if present
      let pdfUrl: string | null = null;
      if (pdfFile) {
        const fileName = `${Date.now()}_${pdfFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('estimates')
          .upload(fileName, pdfFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('estimates')
            .getPublicUrl(fileName);
          pdfUrl = urlData.publicUrl;
        }
      }

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          assignee_id: assigneeId,
          estimate_pdf_url: pdfUrl,
          notify_days_before: notifyDays,
          created_by: user.id,
        })
        .select()
        .single();

      if (projectError || !project) throw projectError;

      // Create items and checks
      for (const item of validItems) {
        const { data: newItem, error: itemError } = await supabase
          .from('items')
          .insert({
            project_id: project.id,
            name: item.name.trim(),
            deadline: item.deadline,
          })
          .select()
          .single();

        if (itemError || !newItem) throw itemError;
        await createChecksForItem(newItem.id);
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      alert('登録に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="pb-8">
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-xl">←</button>
        <h1 className="text-lg font-bold">案件登録</h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* Project name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">案件名</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：新唐津市民会館"
            className="w-full py-3 px-4 border border-gray-200 rounded-xl text-sm"
          />
        </div>

        {/* Assignee */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">担当者</label>
          <select
            required
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full py-3 px-4 border border-gray-200 rounded-xl text-sm bg-white"
          >
            <option value="">選択してください</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* PDF upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">見積PDF</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>

        {/* Notification days */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">通知（期限の何日前）</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={notifyDays}
              onChange={(e) => setNotifyDays(Number(e.target.value))}
              className="w-20 py-3 px-4 border border-gray-200 rounded-xl text-sm text-center"
            />
            <span className="text-sm text-gray-600">日前</span>
          </div>
        </div>

        {/* Items */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">明細</label>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    placeholder="明細名"
                    value={item.name}
                    onChange={(e) => updateItem(i, 'name', e.target.value)}
                    className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm"
                  />
                  <input
                    type="date"
                    value={item.deadline}
                    onChange={(e) => updateItem(i, 'deadline', e.target.value)}
                    className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="mt-2 text-red-400 text-xl px-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-3 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 active:bg-gray-50"
          >
            ＋ 明細追加
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-base disabled:opacity-50"
        >
          {saving ? '登録中...' : '登録する'}
        </button>
      </form>
    </div>
  );
}
