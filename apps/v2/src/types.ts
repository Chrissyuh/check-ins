export type DurationUnit = "days" | "weeks";
export type ProjectStatus = "fresh" | "soon" | "due" | "over-max" | "paused" | "completed";
export type TaskStatus = "open" | "done" | "archived";
export type TaskPriority = "low" | "normal" | "high";

export type Project = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  next_action: string | null;
  target_amount: number;
  target_unit: DurationUnit;
  max_enabled: boolean;
  max_amount: number | null;
  max_unit: DurationUnit | null;
  last_checked_at: string;
  paused_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CheckIn = {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
};

export type Reminder = {
  id: string;
  user_id: string;
  project_id: string;
  enabled: boolean;
  remind_when: "target" | "max";
  local_notification_id: string | null;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  notifications_enabled: boolean;
  default_sort: "urgency" | "alphabetical" | "check-ins";
  created_at: string;
  updated_at: string;
};

export type WorkspaceData = {
  projects: Project[];
  tasks: Task[];
  checkIns: CheckIn[];
};

export type ComputedStatus = {
  status: ProjectStatus;
  label: string;
  tone: "fresh" | "soon" | "due" | "danger" | "paused" | "completed";
  elapsedMs: number;
  targetText: string;
  maxText: string;
  progress: number;
  canCheckIn: boolean;
  cooldownText: string | null;
};
