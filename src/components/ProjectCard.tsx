'use client';

import Link from 'next/link';
import DeadlineBadge from './DeadlineBadge';

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
  urgentItems,
}: ProjectCardProps) {
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  let progressColor = 'bg-red-500';
  if (progress >= 80) progressColor = 'bg-green-500';
  else if (progress >= 30) progressColor = 'bg-yellow-500';

  return (
    <Link href={`/projects/${id}`} className="block">
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">{name}</h3>
            <p className="text-sm text-gray-500">担当：{assigneeName}</p>
          </div>
          {earliestDeadline && <DeadlineBadge deadline={earliestDeadline} />}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>進捗</span>
            <span>{checkedCount}/{totalCount}（{progress}%）</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${progressColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Urgent items */}
        {urgentItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {urgentItems.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <DeadlineBadge deadline={item.deadline} />
                <span className="truncate text-gray-700">{item.name}</span>
                {item.stop_reason && (
                  <span className="shrink-0 px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-[10px]">
                    {item.stop_reason}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
