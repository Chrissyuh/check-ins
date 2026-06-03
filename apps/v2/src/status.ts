import { CHECK_IN_COOLDOWN_MS, formatDuration, unitsToMs } from "./date";
import type { ComputedStatus, Project } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getProjectStatus(project: Project, nowMs = Date.now()): ComputedStatus {
  if (project.completed_at) {
    return {
      status: "completed",
      label: "Complete",
      tone: "completed",
      elapsedMs: 0,
      targetText: "Completed",
      maxText: "Archived in completed",
      progress: 1,
      canCheckIn: false,
      cooldownText: null,
    };
  }

  if (project.paused_at) {
    return {
      status: "paused",
      label: "Paused",
      tone: "paused",
      elapsedMs: 0,
      targetText: "Timer paused",
      maxText: "Resume to continue tracking",
      progress: 0,
      canCheckIn: false,
      cooldownText: null,
    };
  }

  const lastCheckedMs = new Date(project.last_checked_at).getTime();
  const elapsedMs = nowMs - lastCheckedMs;
  const targetMs = unitsToMs(project.target_amount, project.target_unit);
  const maxMs =
    project.max_enabled && project.max_amount && project.max_unit
      ? unitsToMs(project.max_amount, project.max_unit)
      : null;
  const cooldownRemaining = CHECK_IN_COOLDOWN_MS - elapsedMs;
  const canCheckIn = cooldownRemaining <= 0;
  const progressBase = maxMs ?? targetMs;

  let label = "Fresh";
  let status: ComputedStatus["status"] = "fresh";
  let tone: ComputedStatus["tone"] = "fresh";
  let targetText = `${formatDuration(targetMs - elapsedMs)} until target`;
  let maxText = maxMs ? `${formatDuration(maxMs - elapsedMs)} until max` : "Max gap off";

  if (maxMs && elapsedMs >= maxMs) {
    status = "over-max";
    label = "Over max";
    tone = "danger";
    targetText = `${formatDuration(elapsedMs - targetMs)} past target`;
    maxText = `${formatDuration(elapsedMs - maxMs)} past max`;
  } else if (elapsedMs >= targetMs) {
    status = "due";
    label = "Due";
    tone = "due";
    targetText = `${formatDuration(elapsedMs - targetMs)} past target`;
  } else if (elapsedMs / targetMs >= 0.7) {
    status = "soon";
    label = "Soon";
    tone = "soon";
  }

  return {
    status,
    label,
    tone,
    elapsedMs,
    targetText,
    maxText,
    progress: clamp(elapsedMs / progressBase, 0, 1),
    canCheckIn,
    cooldownText: canCheckIn ? null : `Available in ${formatDuration(cooldownRemaining)}`,
  };
}
