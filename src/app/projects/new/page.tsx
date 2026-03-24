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
  const [parsing, setParsing] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);

  const [name, setName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [notifyDays, setNotifyDays] = useState(7);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [items, setItems] = useState<ItemInput[]>([]);

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

  async function handlePdfUpload(file: File) {
    setPdfFile(file);
    setParsing(true);
    setPdfLoaded(false);

    try {
      // Dynamic import to keep it client-side only
      const { parsePdf } = await import('@/lib/parse-pdf-client');
      const result = await parsePdf(file);

      // Auto-fill project name
      if (result.projectName) {
        setName(result.projectName);
      }

      // Auto-fill items
      if (result.items.length > 0) {
        setItems(
          result.items.map((item) => ({
            name: item.name,
            deadline: '',
          }))
        );
      } else {
        // PDF parsed but no items found - let user add manually
        setItems([{ name: '', deadline: '' }]);
      }

      setPdfLoaded(true);
    } catch (err) {
      console.error('PDF parse error:', err);
      alert('PDFの読み取りに失敗しました。明細を手動で入力してください。');
      // Still allow manual input
      setItems([{ name: '', deadline: '' }]);
      setPdfLoaded(true);
    } finally {
      setParsing(false);
    }
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const addItem = () => setItems([...items, { name: '', deadline: '' }]);

  const updateItem = (index: number, field: keyof ItemInput, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const setAllDeadlines = (deadline: string) => {
    setItems(items.map((item) => ({ ...item, deadline })));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    if (!name.trim() || !assigneeId || !pdfFile) return;

    const validItems = items.filter((i) => i.name.trim() && i.deadline);
    if (validItems.length === 0) {
      alert('明細の期限を設定してください');
      return;
    }

    setSaving(true);

    try {
      // Upload PDF to Supabase Storage
      let pdfUrl: string | null = null;
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
        {/* STEP 1: PDF upload */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <label className="block text-sm font-bold text-blue-800 mb-2">
            STEP 1：見積PDFをアップロード
          </label>
          <p className="text-xs text-blue-600 mb-3">
            PDFから案件名と明細を自動で読み取ります
          </p>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePdfUpload(file);
            }}
            className="w-full text-sm"
          />
          {parsing && (
            <div className="mt-3 text-sm text-blue-600 animate-pulse font-medium">
              PDFを解析中...
            </div>
          )}
          {pdfLoaded && (
            <div className="mt-3 text-sm text-green-600 font-medium">
              読み取り完了（{items.length}件の明細を検出）
            </div>
          )}
        </div>

        {/* STEP 2: Only shown after PDF upload */}
        {pdfLoaded && (
          <>
            {/* Project name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                STEP 2：案件情報を確認
              </label>
              <label className="block text-xs text-gray-500 mb-1">案件名</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full py-3 px-4 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">担当者</label>
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

            {/* Notification days */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">通知（期限の何日前）</label>
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
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-gray-700">
                  STEP 3：明細の確認・期限設定（{items.length}件）
                </label>
              </div>

              {/* Bulk deadline setter */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-yellow-800 font-medium">一括期限設定：</span>
                  <input
                    type="date"
                    onChange={(e) => {
                      if (e.target.value) setAllDeadlines(e.target.value);
                    }}
                    className="flex-1 py-2 px-3 border border-yellow-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(i, 'name', e.target.value)}
                          className="w-full py-1.5 px-2 border border-gray-200 rounded text-sm"
                        />
                        <input
                          type="date"
                          value={item.deadline}
                          onChange={(e) => updateItem(i, 'deadline', e.target.value)}
                          className={`w-full py-1.5 px-2 border rounded text-sm ${
                            item.deadline ? 'border-gray-200' : 'border-red-300 bg-red-50'
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-red-400 text-lg px-1 mt-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addItem}
                className="mt-2 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 active:bg-gray-50"
              >
                ＋ 明細追加
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={saving || !assigneeId || items.length === 0}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-base disabled:opacity-50"
            >
              {saving ? '登録中...' : '登録する'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
