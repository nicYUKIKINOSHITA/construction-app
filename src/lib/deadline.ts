import { differenceInCalendarDays } from 'date-fns';

export type DeadlineColor = 'red' | 'yellow' | 'green' | 'gray';

export interface DeadlineInfo {
  days: number;
  color: DeadlineColor;
  label: string;
  overdue: boolean;
}

export function getDeadlineInfo(deadline: string): DeadlineInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);
  const days = differenceInCalendarDays(deadlineDate, today);

  if (days < 0) {
    return { days: Math.abs(days), color: 'red', label: `${Math.abs(days)}日超過`, overdue: true };
  }
  if (days === 0) {
    return { days: 0, color: 'red', label: '本日期限', overdue: false };
  }
  if (days <= 3) {
    return { days, color: 'red', label: `あと${days}日`, overdue: false };
  }
  if (days <= 7) {
    return { days, color: 'yellow', label: `あと${days}日`, overdue: false };
  }
  if (days <= 14) {
    return { days, color: 'green', label: `あと${days}日`, overdue: false };
  }
  return { days, color: 'gray', label: `あと${days}日`, overdue: false };
}

export const colorClasses: Record<DeadlineColor, string> = {
  red: 'bg-red-100 text-red-700 border-red-300',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  green: 'bg-green-100 text-green-700 border-green-300',
  gray: 'bg-gray-100 text-gray-500 border-gray-300',
};
