import { daysAgoIso, localId, nowIso } from "./date";
import type { CheckIn, Project, Task, WorkspaceData } from "./types";

const localUserId = "local-preview";

export function createEmptyWorkspace(): WorkspaceData {
  return { projects: [], tasks: [], checkIns: [] };
}

export function createPreviewWorkspace(): WorkspaceData {
  const now = nowIso();
  const projectA: Project = {
    id: localId("project"),
    user_id: localUserId,
    title: "Portfolio case study",
    notes: "Turn the launched V1 into a clear write-up.",
    next_action: "Draft the before/after section",
    target_amount: 2,
    target_unit: "days",
    max_enabled: true,
    max_amount: 5,
    max_unit: "days",
    last_checked_at: daysAgoIso(1),
    paused_at: null,
    completed_at: null,
    archived_at: null,
    sort_order: 1,
    created_at: daysAgoIso(8),
    updated_at: now,
  };
  const projectB: Project = {
    id: localId("project"),
    user_id: localUserId,
    title: "Garage cleanup",
    notes: "A recurring project that should not vanish from memory.",
    next_action: "Clear one shelf",
    target_amount: 1,
    target_unit: "weeks",
    max_enabled: true,
    max_amount: 2,
    max_unit: "weeks",
    last_checked_at: daysAgoIso(10),
    paused_at: null,
    completed_at: null,
    archived_at: null,
    sort_order: 2,
    created_at: daysAgoIso(30),
    updated_at: now,
  };
  const tasks: Task[] = [
    makePreviewTask(projectA.id, "Collect screenshots", "done", 1),
    makePreviewTask(projectA.id, "Draft the before/after section", "open", 2),
    makePreviewTask(projectB.id, "Clear one shelf", "open", 1),
  ];
  const checkIns: CheckIn[] = [
    makePreviewCheckIn(projectA.id, "Task completed", daysAgoIso(1), tasks[0].id),
    makePreviewCheckIn(projectB.id, "Sorted tools", daysAgoIso(10)),
  ];

  return { projects: [projectA, projectB], tasks, checkIns };
}

function makePreviewTask(
  projectId: string,
  title: string,
  status: Task["status"],
  sortOrder: number
): Task {
  const now = nowIso();
  return {
    id: localId("task"),
    user_id: localUserId,
    project_id: projectId,
    title,
    status,
    priority: "normal",
    due_at: null,
    completed_at: status === "done" ? now : null,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

function makePreviewCheckIn(
  projectId: string,
  note: string,
  occurredAt: string,
  taskId: string | null = null
): CheckIn {
  return {
    id: localId("checkin"),
    user_id: localUserId,
    project_id: projectId,
    task_id: taskId,
    note,
    occurred_at: occurredAt,
    created_at: occurredAt,
  };
}
