'use client';

import { getDeadlineInfo, colorClasses } from '@/lib/deadline';

export default function DeadlineBadge({ deadline }: { deadline: string }) {
  const info = getDeadlineInfo(deadline);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${colorClasses[info.color]}`}
    >
      {info.overdue ? '⚠ ' : ''}{info.label}
    </span>
  );
}
