import type { DurationUnit } from "./types";

export const CHECK_IN_COOLDOWN_MS = 30 * 60 * 1000;

export function nowIso() {
  return new Date().toISOString();
}

export function unitsToMs(amount: number, unit: DurationUnit | null) {
  const days = unit === "weeks" ? amount * 7 : amount;
  return days * 24 * 60 * 60 * 1000;
}

export function formatDuration(ms: number) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(safeMs / 3600000);
  const days = Math.floor(safeMs / 86400000);

  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (hours < 48) return `${hours} hr${hours === 1 ? "" : "s"}`;
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;

  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
