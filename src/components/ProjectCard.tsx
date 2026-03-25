'use client';

import Link from 'next/link';
import { getDeadlineInfo } from '@/lib/deadline';

interface ProjectCardProps {
  id: string;
  name: string;
  assigneeName: string;
  checkedCount: number;
  totalCount: number;
  earliestDeadline: string | null;
  urgentItems: {
    name: string;
    deadline: string;
    unchecked_count: number;
    stop_reason?: string | null;
  }[];
}

export default function ProjectCard({
  id,
  name,
  assigneeName,
  checkedCount,
  totalCount,
  earliestDeadline,
}: ProjectCardProps) {
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  let progressColor = 'bg-red-500';
  if (progress >= 80) progressColor = 'bg-green-500';
  else if (progress >= 30) progressColor = 'bg-yellow-500';

  // Badge info
  const deadlineInfo = earliestDeadline ? getDeadlineInfo(earliestDeadline) : null;
  const showBadge = deadlineInfo && (deadlineInfo.overdue || deadlineInfo.color === 'red' || deadlineInfo.color === 'yellow');

  return (
    <Link href={`/projects/${id}`} className="block">
      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 shadow-sm active:bg-gray-50 transition-colors relative">
        {/* Badge */}
        {showBadge && (
          <div className={`absolute top-1 right-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            deadlineInfo.overdue || deadlineInfo.color === 'red' ? 'bg-red-500' : 'bg-yellow-500'
          }`}>
            {deadlineInfo.overdue ? `${deadlineInfo.days}日超過` : deadlineInfo.label}
          </div>
        )}

        {/* 1行目: 案件名 + 担当 + 進捗 */}
        <div className="flex items-center gap-2 pr-16">
          <h3 className="font-bold text-sm truncate flex-1">{name}</h3>
          <span className="text-[11px] text-gray-400 shrink-0">{assigneeName}</span>
        </div>

        {/* 2行目: プログレスバー */}
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${progressColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-400 shrink-0 w-16 text-right">{checkedCount}/{totalCount} ({progress}%)</span>
        </div>
      </div>
    </Link>
  );
}
