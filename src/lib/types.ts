export interface User {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  assignee_id: string;
  estimate_pdf_url: string | null;
  notify_days_before: number;
  created_at: string;
  created_by: string;
  // joined
  assignee_name?: string;
  checked_count?: number;
  total_count?: number;
  earliest_deadline?: string;
  // urgent items for project card
  urgent_items?: {
    name: string;
    deadline: string;
    unchecked_count: number;
    stop_reason?: string | null;
  }[];
}

export interface Item {
  id: string;
  project_id: string;
  name: string;
  deadline: string;
  merged_into_id: string | null;
  created_at: string;
  // joined
  checks?: Check[];
}

export interface Check {
  id: string;
  item_id: string;
  step_number: number;
  sub_step: number | null;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  stop_reason: string | null;
}

export interface StopReason {
  id: string;
  label: string;
  sort_order: number;
}

export interface PersonalTask {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}
