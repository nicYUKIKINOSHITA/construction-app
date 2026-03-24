'use client';

import { useState } from 'react';
import type { Item } from '@/lib/types';

interface ItemMergeDialogProps {
  items: Item[];
  onMerge: (selectedIds: string[], newName: string, newDeadline: string) => void;
  onClose: () => void;
}

export default function ItemMergeDialog({ items, onMerge, onClose }: ItemMergeDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedItems = items.filter((i) => selected.has(i.id));
  const latestDeadline = selectedItems.length > 0
    ? selectedItems.reduce((max, item) => (item.deadline > max ? item.deadline : max), selectedItems[0].deadline)
    : '';

  const canMerge = selected.size >= 2 && newName.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-1">明細を統合</h3>
        <p className="text-sm text-gray-500 mb-4">統合する明細を2つ以上選択してください</p>

        <div className="space-y-2 mb-4">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`w-full text-left py-3 px-4 rounded-lg text-sm transition-colors ${
                selected.has(item.id)
                  ? 'bg-blue-50 text-blue-700 border border-blue-300'
                  : 'bg-gray-50 text-gray-700'
              }`}
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">期限：{item.deadline}</div>
            </button>
          ))}
        </div>

        {selected.size >= 2 && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700">統合後の名称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例：パラペット笠木（全種）"
                className="mt-1 w-full py-2 px-3 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="text-sm text-gray-500">
              統合後の期限：<strong>{latestDeadline}</strong>（最も遅い期限）
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm"
          >
            キャンセル
          </button>
          <button
            onClick={() => {
              if (canMerge) onMerge(Array.from(selected), newName.trim(), latestDeadline);
            }}
            disabled={!canMerge}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm disabled:opacity-40"
          >
            統合する
          </button>
        </div>
      </div>
    </div>
  );
}
