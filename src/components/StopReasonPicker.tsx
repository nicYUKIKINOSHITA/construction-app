'use client';

import { useState } from 'react';
import { STOP_REASONS } from '@/lib/constants';

interface StopReasonPickerProps {
  currentReason: string | null;
  onSelect: (reason: string | null) => void;
  onClose: () => void;
}

export default function StopReasonPicker({ currentReason, onSelect, onClose }: StopReasonPickerProps) {
  const [customReason, setCustomReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg bg-white rounded-t-2xl p-4 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-base mb-3">停止理由を選択</h3>

        <div className="space-y-2 mb-4">
          {STOP_REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => onSelect(reason)}
              className={`w-full text-left py-3 px-4 rounded-lg text-sm transition-colors ${
                currentReason === reason
                  ? 'bg-orange-100 text-orange-700 border border-orange-300'
                  : 'bg-gray-50 text-gray-700 active:bg-gray-100'
              }`}
            >
              {reason}
            </button>
          ))}
        </div>

        {/* Free text input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="その他（自由入力）"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            className="flex-1 py-2 px-3 border border-gray-200 rounded-lg text-sm"
          />
          <button
            onClick={() => {
              if (customReason.trim()) onSelect(customReason.trim());
            }}
            disabled={!customReason.trim()}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium disabled:opacity-40"
          >
            設定
          </button>
        </div>

        {currentReason && (
          <button
            onClick={() => onSelect(null)}
            className="w-full py-2 text-sm text-gray-500"
          >
            理由をクリア
          </button>
        )}
      </div>
    </div>
  );
}
