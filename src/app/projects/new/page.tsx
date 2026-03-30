'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createChecksForItem } from '@/lib/checks';
import type { User } from '@/lib/types';

interface ItemInput {
  name: string;
  deadline: string;
}

type InputMode = 'select' | 'paste' | 'manual' | 'pdf';

// 担当者5名（社長・山本・森を除く）
const ASSIGNEE_NAMES = ['専務', '堺', '児玉', '水田', '清水'];

export default function NewProjectPage() {
  const router = useRouter();
  const [assignees, setAssignees] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);

  const [inputMode, setInputMode] = useState<InputMode>('select');
  const [name, setName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [notifyDays, setNotifyDays] = useState(7);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [items, setItems] = useState<ItemInput[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState('');
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase
      .from('users')
      .select('*')
      .in('name', ASSIGNEE_NAMES)
      .order('name')
      .then(({ data }) => setAssignees(data || []));
  }, []);

  // Parse pasted Excel data (tab-separated: No, 製品名, 仕様, 数量, 備考)
  function parsePasteData(text: string): ItemInput[] {
    const lines = text.split('\n').filter((l) => l.trim());
    const parsed: ItemInput[] = [];

    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 2) continue;

      // Skip header rows
      const first = cols[0].trim();
      if (/^(No|番号|#|no\.|項目)$/i.test(first)) continue;

      // cols[0]=No, cols[1]=製品名, cols[2]=仕様, cols[3]=数量, cols[4]=備考
      const productName = (cols[1] || '').trim();
      const spec = (cols[2] || '').trim();
      const quantity = (cols[3] || '').trim();
      const note = (cols[4] || '').trim();

      if (!productName) continue;

      // Build item name: 製品名 + 仕様 + 数量
      const parts = [productName];
      if (spec) parts.push(spec);
      if (quantity) parts.push(`(${quantity})`);
      if (note) parts.push(`[${note}]`);

      parsed.push({ name: parts.join(' '), deadline: '' });
    }

    return parsed;
  }

  function handlePaste() {
    const parsed = parsePasteData(pasteText);
    if (parsed.length === 0) {
      setParseMessage('明細を検出できませんでした。形式を確認してください。');
      return;
    }
    setItems(parsed);
    setParseMessage(`${parsed.length}件の明細を読み取りました`);
  }

  async function handlePdfUpload(file: File) {
    setPdfFile(file);
    setParsing(true);
    setParseMessage('');

    try {
      const { parsePdf } = await import('@/lib/parse-pdf-client');
      const result = await parsePdf(file);

      if (result.projectName) setName(result.projectName);

      if (result.items.length > 0) {
        setItems(
          result.items.map((item) => ({
            name: item.name,
            deadline: result.deadline || '',
          }))
        );
        setParseMessage(`${result.items.length}件の明細を検出`);
      } else {
        setParseMessage('明細を検出できませんでした。手動で追加してください。');
        setItems([{ name: '', deadline: '' }]);
      }
    } catch {
      setParseMessage('PDFの読み取りに失敗しました。');
      setItems([{ name: '', deadline: '' }]);
    } finally {
      setParsing(false);
    }
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    const lastDeadline = items.length > 0 ? items[items.length - 1].deadline : '';
    setItems([...items, { name: '', deadline: lastDeadline }]);
  };

  const updateItem = (index: number, field: keyof ItemInput, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  // Get today's date for min attribute
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) { alert('案件名を入力してください'); return; }
    if (!assigneeId) { alert('担当者を選択してください'); return; }

    const validItems = items.filter((i) => i.name.trim() && i.deadline);
    if (validItems.length === 0) {
      alert('明細を1つ以上入力し、期限を設定してください');
      return;
    }

    setSaving(true);

    try {
      let pdfUrl: string | null = null;
      if (pdfFile) {
        try {
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
        } catch (storageErr) {
          console.warn('Storage error:', storageErr);
        }
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          assignee_id: assigneeId,
          estimate_pdf_url: pdfUrl,
          notify_days_before: notifyDays,
          created_by: assigneeId,
        })
        .select()
        .single();

      if (projectError || !project) throw new Error(`案件作成に失敗: ${projectError?.message}`);

      const { data: newItems, error: itemError } = await supabase
        .from('items')
        .insert(validItems.map((item) => ({
          project_id: project.id,
          name: item.name.trim(),
          deadline: item.deadline,
        })))
        .select();

      if (itemError || !newItems) throw new Error(`明細作成に失敗: ${itemError?.message}`);

      await Promise.all(newItems.map((item) => createChecksForItem(item.id)));
      router.push(`/projects/${project.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '登録に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  const showForm = inputMode !== 'select' && (inputMode === 'manual' || items.length > 0 || inputMode === 'paste');

  return (
    <div className="pb-8">
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-xl">←</button>
        <h1 className="text-lg font-bold">案件登録</h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Input mode selector */}
        {inputMode === 'select' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 font-medium">明細の入力方法を選択</p>

            <button
              type="button"
              onClick={() => {
                setInputMode('paste');
                setTimeout(() => pasteRef.current?.focus(), 100);
              }}
              className="w-full p-4 bg-green-50 border-2 border-green-200 rounded-xl text-left active:bg-green-100"
            >
              <div className="font-bold text-green-800 text-sm">Excelからコピペ</div>
              <div className="text-xs text-green-600 mt-1">
                No / 製品名 / 仕様 / 数量 / 備考 の5列をコピーして貼り付け
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputMode('manual');
                setItems([{ name: '', deadline: '' }]);
              }}
              className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-left active:bg-gray-100"
            >
              <div className="font-bold text-gray-800 text-sm">手入力</div>
              <div className="text-xs text-gray-600 mt-1">明細を1つずつ手動で入力</div>
            </button>

            <button
              type="button"
              onClick={() => setInputMode('pdf')}
              className="w-full p-4 bg-blue-50 border-2 border-blue-200 rounded-xl text-left active:bg-blue-100"
            >
              <div className="font-bold text-blue-800 text-sm">見積PDF読取</div>
              <div className="text-xs text-blue-600 mt-1">PDFから案件名・明細を自動抽出（精度は書式による）</div>
            </button>
          </div>
        )}

        {/* Paste mode */}
        {inputMode === 'paste' && items.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">Excelデータを貼り付け</label>
              <button
                type="button"
                onClick={() => { setInputMode('select'); setPasteText(''); setParseMessage(''); }}
                className="text-xs text-gray-500 underline"
              >
                戻る
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
              <p className="font-medium mb-1">形式（タブ区切り）:</p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="pr-2 py-1">No</th>
                    <th className="pr-2 py-1">製品名</th>
                    <th className="pr-2 py-1">仕様</th>
                    <th className="pr-2 py-1">数量</th>
                    <th className="py-1">備考</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-2 py-1">1</td>
                    <td className="pr-2 py-1">アルミ笠木</td>
                    <td className="pr-2 py-1">W330 t2.0</td>
                    <td className="pr-2 py-1">5.7m</td>
                    <td className="py-1">B-FUE</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <textarea
              ref={pasteRef}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Excelでコピーした内容をここに貼り付け (Ctrl+V)"
              className="w-full h-40 py-3 px-4 border border-gray-300 rounded-xl text-sm font-mono resize-none"
            />
            {parseMessage && (
              <div className={`text-sm font-medium ${items.length > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                {parseMessage}
              </div>
            )}
            <button
              type="button"
              onClick={handlePaste}
              disabled={!pasteText.trim()}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 active:bg-green-700"
            >
              読み取る
            </button>
          </div>
        )}

        {/* PDF mode */}
        {inputMode === 'pdf' && items.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">見積PDF</label>
              <button
                type="button"
                onClick={() => { setInputMode('select'); setParseMessage(''); }}
                className="text-xs text-gray-500 underline"
              >
                戻る
              </button>
            </div>
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
              <div className="text-sm text-blue-600 animate-pulse font-medium">PDFを解析中...</div>
            )}
            {parseMessage && (
              <div className="text-sm text-orange-600 font-medium">{parseMessage}</div>
            )}
          </div>
        )}

        {/* Manual mode - show form immediately */}
        {inputMode === 'manual' && items.length === 0 && (
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-gray-700">手入力</label>
            <button
              type="button"
              onClick={() => { setInputMode('select'); setItems([]); }}
              className="text-xs text-gray-500 underline"
            >
              戻る
            </button>
          </div>
        )}

        {/* Form (shown after items are loaded or in manual mode) */}
        {(showForm || (inputMode !== 'select' && items.length > 0)) && (
          <>
            {/* Project name */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">案件名</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：新唐津市民会館改築工事"
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
                {assignees.map((u) => (
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

            {/* Items list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-gray-700">
                  明細（{items.length}件）
                </label>
                {inputMode !== 'manual' && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('select');
                      setItems([]);
                      setName('');
                      setPasteText('');
                      setParseMessage('');
                    }}
                    className="text-xs text-gray-500 underline"
                  >
                    入力し直す
                  </button>
                )}
              </div>

              {parseMessage && items.length > 0 && (
                <div className="text-sm text-green-600 font-medium mb-2">{parseMessage}</div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {items.map((item, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 mt-2 w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          placeholder="製品名"
                          value={item.name}
                          onChange={(e) => updateItem(i, 'name', e.target.value)}
                          className="w-full py-1.5 px-2 border border-gray-200 rounded text-sm"
                        />
                        <input
                          type="date"
                          value={item.deadline}
                          min={today}
                          max={maxDateStr}
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
              disabled={saving}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-base disabled:opacity-50 active:bg-blue-700"
            >
              {saving ? '登録中...' : '登録する'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
