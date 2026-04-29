import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "checkins.items.v2";
const COMPLETED_KEY = "checkins.completed.v1";
const SETTINGS_KEY = "checkins.settings.v2";
const ONBOARDING_KEY = "checkins.onboarding.done.v2";
const ALERT_NEVER_KEY = "checkins.alerts.never.v2";
const ALERT_SESSION_KEY = "checkins.alerts.dismissed.session.v2";
const COOLDOWN_MS = 30 * 60 * 1000;

const defaultSettings = { alertsEnabled: false };
const defaultForm = {
  name: "",
  targetAmount: 2,
  targetUnit: "days",
  maxEnabled: true,
  maxAmount: 5,
  maxUnit: "days",
};

function Glyph({ children, size = 18, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center leading-none ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.9 }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function IconPath({ size = 16, className = "", d }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon(props) {
  return <IconPath {...props} d="M4.5 10.5L8.25 14.25L15.5 6.75" />;
}

function ClockIcon(props) {
  return <IconPath {...props} d="M10 5.25V10L13.25 11.75M17 10A7 7 0 1 1 3 10A7 7 0 0 1 17 10Z" />;
}

function TrashIcon(props) {
  return <IconPath {...props} d="M5.75 7.25V14.5M10 7.25V14.5M14.25 7.25V14.5M4.5 5.25H15.5M7.25 5.25V3.75H12.75V5.25M6 16.25H14C14.55 16.25 15 15.8 15 15.25V5.25H5V15.25C5 15.8 5.45 16.25 6 16.25Z" />;
}

function EditIcon(props) {
  return <IconPath {...props} d="M4.75 15.25L7.75 14.5L14.5 7.75L11.5 4.75L4.75 11.5L4 14.5L4.75 15.25ZM10.75 5.5L13.75 8.5" />;
}

function CloseIcon(props) {
  return <IconPath {...props} d="M5.5 5.5L14.5 14.5M14.5 5.5L5.5 14.5" />;
}

function SaveIcon(props) {
  return <IconPath {...props} d="M5 4.5H13.5L15.5 6.5V15.5H4.5V5C4.5 4.7 4.7 4.5 5 4.5ZM7 4.5V8H12.5V4.5M7 15.5V11H13V15.5" />;
}

function BookIcon(props) {
  return <IconPath {...props} d="M5.5 4.75H13.5C14.6 4.75 15.5 5.65 15.5 6.75V15.25H7.25C6.28 15.25 5.5 14.47 5.5 13.5V4.75ZM5.5 13.5C5.5 12.53 6.28 11.75 7.25 11.75H15.5" />;
}

function BellIcon(props) {
  return <IconPath {...props} d="M10 3.75A3 3 0 0 0 7 6.75V8.1C7 9.07 6.66 10 6.03 10.73L5 11.95V13H15V11.95L13.97 10.73C13.34 10 13 9.07 13 8.1V6.75A3 3 0 0 0 10 3.75ZM8.25 14.5A1.75 1.75 0 0 0 11.75 14.5" />;
}

function GearIcon(props) {
  return <IconPath {...props} d="M4.5 5.5H15.5M4.5 10H15.5M4.5 14.5H15.5M8 4V7M12.25 8.5V11.5M6.5 13V16" />;
}

function ChevronDown(props) {
  return <IconPath {...props} d="M5.5 7.5L10 12L14.5 7.5" />;
}

const I = {
  plus: (props) => <Glyph {...props}>+</Glyph>,
  check: (props) => <CheckIcon {...props} />,
  clock: (props) => <ClockIcon {...props} />,
  trash: (props) => <TrashIcon {...props} />,
  edit: (props) => <EditIcon {...props} />,
  close: (props) => <CloseIcon {...props} />,
  save: (props) => <SaveIcon {...props} />,
  book: (props) => <BookIcon {...props} />,
  warn: (props) => <Glyph {...props}>!</Glyph>,
  bell: (props) => <BellIcon {...props} />,
  dots: (props) => <Glyph {...props}>...</Glyph>,
  gear: (props) => <GearIcon {...props} />,
  down: (props) => <ChevronDown {...props} />,
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function currentTimestamp() {
  return Date.now();
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${currentTimestamp()}-${Math.random().toString(16).slice(2)}`;
}

function unitsToMs(amount, unit) {
  const n = Number(amount) || 0;
  const day = 24 * 60 * 60 * 1000;
  return unit === "weeks" ? n * 7 * day : n * day;
}

function formatDuration(ms) {
  if (ms <= 0) return "now";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (hours < 48) return `${hours} hr${hours === 1 ? "" : "s"}`;
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;

  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function toDateTimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function sortLog(log) {
  return [...log].filter(Number.isFinite).sort((a, b) => b - a);
}

function createFormState(item) {
  return {
    name: item.name,
    targetAmount: item.targetAmount,
    targetUnit: item.targetUnit,
    maxEnabled: item.maxEnabled !== false,
    maxAmount: item.maxAmount ?? defaultForm.maxAmount,
    maxUnit: item.maxUnit,
  };
}

function withComputedDurations(form) {
  const targetAmount = Number(form.targetAmount);
  const targetMs = unitsToMs(targetAmount, form.targetUnit);
  const maxEnabled = form.maxEnabled !== false;
  const maxAmount = Number(form.maxAmount);
  const maxMs = maxEnabled ? unitsToMs(maxAmount, form.maxUnit) : null;

  return {
    ...form,
    name: form.name.trim(),
    targetAmount,
    maxEnabled,
    maxAmount,
    targetMs,
    maxMs,
  };
}

function getFormError(form) {
  if (!form.name.trim()) return "Name is required.";

  const targetMs = unitsToMs(form.targetAmount, form.targetUnit);
  if (targetMs <= 0) return "Target gap must be at least 1 day.";

  if (form.maxEnabled === false) return "";

  const maxMs = unitsToMs(form.maxAmount, form.maxUnit);
  if (maxMs <= targetMs) {
    return "Max gap must be longer than the target gap.";
  }

  return "";
}

function makeItem(form) {
  const now = Date.now();
  const normalized = withComputedDurations(form);

  return {
    id: uid(),
    ...normalized,
    createdAt: now,
    lastCheckedAt: now,
    pausedAt: null,
    log: [],
  };
}

function normalizeItem(item) {
  const targetMs = item.targetMs ?? unitsToMs(item.targetAmount, item.targetUnit);
  const maxEnabled = item.maxEnabled !== false && Number.isFinite(item.maxAmount);
  const maxMs = maxEnabled
    ? item.maxMs ?? unitsToMs(item.maxAmount, item.maxUnit)
    : null;
  const log = sortLog(Array.isArray(item.log) ? item.log : []);
  const lastCheckedAt = log[0] ?? item.lastCheckedAt ?? item.createdAt ?? Date.now();

  return {
    ...item,
    maxEnabled,
    maxAmount: item.maxAmount ?? defaultForm.maxAmount,
    targetMs,
    maxMs,
    pausedAt: item.pausedAt ?? null,
    log,
    lastCheckedAt,
  };
}

function getStatus(item, now) {
  const isPaused = Number.isFinite(item.pausedAt);
  const elapsed = now - item.lastCheckedAt;
  const targetRemaining = item.targetMs - elapsed;
  const hasMax = item.maxEnabled !== false && item.maxMs != null;
  const maxRemaining = hasMax ? item.maxMs - elapsed : Infinity;
  const targetProgress = item.targetMs > 0 ? elapsed / item.targetMs : 1;
  const maxProgress = hasMax && item.maxMs > 0 ? elapsed / item.maxMs : targetProgress;
  const isOverMax = !isPaused && hasMax ? elapsed >= item.maxMs : false;
  const isDue = !isPaused && elapsed >= item.targetMs;
  const hasCheckIns = Array.isArray(item.log) && item.log.length > 0;
  const canCheckIn = !isPaused && (!hasCheckIns || elapsed >= COOLDOWN_MS);

  let label = "Fresh";
  let tone = "fresh";
  let alertLevel = "fresh";
  let targetText = `${formatDuration(targetRemaining)} until target`;
  let maxText = hasMax ? `${formatDuration(maxRemaining)} until max` : "Max gap disabled";

  if (isPaused) {
    label = "Paused";
    tone = "paused";
    alertLevel = "fresh";
    targetText = "Timer paused";
    maxText = "Paused";
  } else if (isOverMax) {
    label = "Over max";
    tone = "danger";
    alertLevel = "over-max";
    targetText = `${formatDuration(Math.abs(targetRemaining))} past target`;
    maxText = `${formatDuration(Math.abs(maxRemaining))} past max`;
  } else if (isDue) {
    label = "Due";
    tone = "due";
    alertLevel = "due";
    targetText = `${formatDuration(Math.abs(targetRemaining))} past target`;
  } else if (targetProgress >= 0.7) {
    label = "Soon";
    tone = "soon";
  }

  return {
    elapsed,
    cooldownRemaining: COOLDOWN_MS - elapsed,
    targetProgress: clamp(targetProgress, 0, 1),
    maxProgress: clamp(maxProgress, 0, 1),
    isDue,
    isOverMax,
    isPaused,
    canCheckIn,
    label,
    tone,
    alertLevel,
    hasCheckIns,
    targetText,
    maxText,
  };
}

function toneClass(tone) {
  if (tone === "danger") return "text-red-700";
  if (tone === "due") return "text-amber-700";
  if (tone === "soon") return "text-yellow-700";
  if (tone === "paused") return "text-stone-500";
  return "text-emerald-700";
}

function barClass(tone) {
  if (tone === "danger") return "bg-red-500";
  if (tone === "due") return "bg-amber-500";
  if (tone === "soon") return "bg-yellow-500";
  if (tone === "paused") return "bg-stone-300";
  return "bg-emerald-500";
}

function getFaviconStatus(stats) {
  if (stats.overMax > 0) return "over-max";
  if (stats.due > 0) return "due";
  return "fresh";
}

function getFaviconColor(status) {
  if (status === "over-max") return "#dc2626";
  if (status === "due") return "#d97706";
  return "#0f172a";
}

function createFaviconDataUrl(status) {
  const color = getFaviconColor(status);
  const cacheKey = currentTimestamp();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <!-- ${status}:${cacheKey} -->
  <rect width="64" height="64" rx="18" fill="#f5f5f4"/>
  <circle cx="32" cy="32" r="14" fill="${color}"/>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getDocumentTitle(stats) {
  if (stats.overMax > 0) {
    return `● ${stats.overMax} ${stats.overMax === 1 ? "over max" : "over max"} — Check-ins`;
  }

  if (stats.due > 0) {
    return `● ${stats.due} ${stats.due === 1 ? "due" : "due"} — Check-ins`;
  }

  return "Check-ins";
}

function runSanityTests() {
  if (typeof window === "undefined" || window.__checkInTestsRan) return;

  window.__checkInTestsRan = true;
  console.assert(unitsToMs(1, "days") === 86400000, "days convert to ms");
  console.assert(unitsToMs(2, "days") === 172800000, "multiple days convert to ms");
  console.assert(unitsToMs(1, "weeks") === 604800000, "weeks convert to ms");
  console.assert(formatDuration(30 * 60000) === "30 min", "duration formats minutes");
  console.assert(sortLog([2, 5, 1]).join(",") === "5,2,1", "log sorts newest first");

  const base = 1000000;
  const fake = { lastCheckedAt: base, targetMs: 3600000, maxMs: 7200000 };

  console.assert(
    getStatus(fake, base + 20 * 60000).canCheckIn === false,
    "cooldown blocks early check-ins"
  );
  console.assert(
    getStatus(fake, base + 31 * 60000).canCheckIn === true,
    "cooldown allows later check-ins"
  );
  console.assert(
    getStatus(fake, base + 3 * 3600000).isOverMax === true,
    "over max status works"
  );
  console.assert(
    getStatus({ ...fake, maxEnabled: false, maxMs: null }, base + 3 * 3600000).isOverMax === false,
    "disabled max never becomes over max"
  );
  console.assert(
    getStatus({ ...fake, createdAt: base, lastCheckedAt: base, log: [] }, base).canCheckIn === true,
    "new item can check in immediately"
  );
  console.assert(
    getFormError({
      name: "test",
      targetAmount: 2,
      targetUnit: "days",
      maxEnabled: true,
      maxAmount: 2,
      maxUnit: "days",
    }) === "Max gap must be longer than the target gap.",
    "max gap must be greater than target"
  );
}

function getInitialItems() {
  if (typeof window === "undefined") return [];
  const savedItems = readJson(STORAGE_KEY, []);
  return Array.isArray(savedItems) ? savedItems.map(normalizeItem) : [];
}

function getInitialCompletedItems() {
  if (typeof window === "undefined") return [];
  const savedItems = readJson(COMPLETED_KEY, []);
  return Array.isArray(savedItems) ? savedItems.map(normalizeItem) : [];
}

function getInitialSettings() {
  if (typeof window === "undefined") return defaultSettings;
  return { ...defaultSettings, ...readJson(SETTINGS_KEY, defaultSettings) };
}

function getInitialPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

function shouldShowOnboardingInitially() {
  return typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY) !== "done";
}

function shouldShowAlertPromptInitially() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (localStorage.getItem(ONBOARDING_KEY) !== "done") return false;
  if (Notification.permission !== "default") return false;
  if (localStorage.getItem(ALERT_NEVER_KEY) === "true") return false;
  if (sessionStorage.getItem(ALERT_SESSION_KEY) === "true") return false;
  return true;
}

function ItemMeta({ stats }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
      <span>
        <strong className="text-stone-900">{stats.total}</strong> items
      </span>
      <span className="text-stone-300">&bull;</span>
      <span>
        <strong className="text-emerald-700">{stats.fresh}</strong> fresh
      </span>
      <span className="text-stone-300">&bull;</span>
      <span>
        <strong className="text-amber-700">{stats.due}</strong> due
      </span>
      <span className="text-stone-300">&bull;</span>
      <span>
        <strong className="text-red-700">{stats.overMax}</strong> over max
      </span>
      <span className="text-stone-300">&bull;</span>
      <span>
        <strong className="text-stone-900">{stats.logs}</strong> check-ins
      </span>
    </div>
  );
}

function TargetSummary({ item }) {
  return (
    <p className="mt-0.5 text-sm text-stone-500">
      Target gap: {item.targetAmount} {item.targetUnit} | Max gap:{" "}
      {item.maxEnabled === false ? "Off" : `${item.maxAmount} ${item.maxUnit}`}
    </p>
  );
}

export default function App() {
  const notifiedRef = useRef({});
  const [items, setItems] = useState(getInitialItems);
  const [completedItems, setCompletedItems] = useState(getInitialCompletedItems);
  const [form, setForm] = useState(defaultForm);
  const [settings, setSettings] = useState(getInitialSettings);
  const [permission, setPermission] = useState(getInitialPermission);
  const [now, setNow] = useState(() => currentTimestamp());
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboardingInitially);
  const [showAlertPrompt, setShowAlertPrompt] = useState(
    shouldShowAlertPromptInitially
  );
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [openLogId, setOpenLogId] = useState(null);
  const [sortMode, setSortMode] = useState("urgency");

  useEffect(() => {
    runSanityTests();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(completedItems));
  }, [completedItems]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showAlertPrompt || alertsLoading || alertMessage) return;

    let hideTimer = null;
    const activityEvents = ["click", "keydown", "scroll"];

    function handleActivity() {
      if (hideTimer) return;

      hideTimer = window.setTimeout(() => {
        sessionStorage.setItem(ALERT_SESSION_KEY, "true");
        setShowAlertPrompt(false);
      }, 7000);
    }

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    return () => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }

      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [showAlertPrompt, alertsLoading, alertMessage]);

  useEffect(() => {
    if (
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !settings.alertsEnabled
    ) {
      return;
    }

    const next = { ...notifiedRef.current };
    let changed = false;

    for (const item of items) {
      const status = getStatus(item, now);
      const key = `${item.id}:${item.lastCheckedAt}`;

      if (status.alertLevel === "due" && !next[key]) {
        new Notification(`${item.name} is due`, { body: status.maxText });
        next[key] = "due";
        changed = true;
      }

      if (status.alertLevel === "over-max" && next[key] !== "over-max") {
        new Notification(`${item.name} is over max`, { body: status.maxText });
        next[key] = "over-max";
        changed = true;
      }
    }

    if (changed) {
      notifiedRef.current = next;
    }
  }, [items, now, settings.alertsEnabled]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const statusA = getStatus(a, now);
      const statusB = getStatus(b, now);

      if (statusA.isPaused !== statusB.isPaused) {
        return statusA.isPaused ? 1 : -1;
      }

      if (sortMode === "alphabetical") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      if (sortMode === "checkins") {
        if (b.log.length !== a.log.length) {
          return b.log.length - a.log.length;
        }

        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (statusA.isOverMax !== statusB.isOverMax) return statusA.isOverMax ? -1 : 1;
      if (statusA.isDue !== statusB.isDue) return statusA.isDue ? -1 : 1;
      if (statusB.maxProgress !== statusA.maxProgress) {
        return statusB.maxProgress - statusA.maxProgress;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [items, now, sortMode]);

  const stats = useMemo(() => {
    const statuses = items.map((item) => getStatus(item, now));

    return {
      total: items.length,
      fresh: statuses.filter((status) => !status.isDue).length,
      due: statuses.filter((status) => status.isDue && !status.isOverMax).length,
      overMax: statuses.filter((status) => status.isOverMax).length,
      logs: items.reduce((sum, item) => sum + item.log.length, 0),
    };
  }, [items, now]);

  useEffect(() => {
    const rel = 'link[rel="icon"]';
    let iconLink = document.querySelector(rel);

    if (!iconLink) {
      iconLink = document.createElement("link");
      iconLink.setAttribute("rel", "icon");
      document.head.appendChild(iconLink);
    }

    iconLink.setAttribute("type", "image/svg+xml");
    iconLink.setAttribute("href", createFaviconDataUrl(getFaviconStatus(stats)));
    document.title = getDocumentTitle(stats);
  }, [stats]);

  async function requestAlerts() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setSettings((current) => ({ ...current, alertsEnabled: false }));
      setAlertMessage("This browser does not support alerts.");
      return;
    }

    setAlertsLoading(true);
    setAlertMessage("");

    try {
      const permissionRequest = Notification.requestPermission().catch(() => null);

      await Promise.race([
        permissionRequest,
        new Promise((resolve) => setTimeout(resolve, 1100)),
      ]);

      const finalPermission = Notification.permission;
      setPermission(finalPermission);

      if (finalPermission === "granted") {
        setSettings((current) => ({ ...current, alertsEnabled: true }));
        setShowAlertPrompt(false);
        setAlertMessage("");
        new Notification("Alerts enabled", {
          body: "Reminders will appear while this page is open.",
        });
      } else {
        setSettings((current) => ({ ...current, alertsEnabled: false }));
        setShowAlertPrompt(true);
        setAlertMessage(
          "Alerts were not enabled. Check browser settings for this site, allow notifications, then try again."
        );
      }
    } finally {
      setAlertsLoading(false);
    }
  }

  function addItem(event) {
    event.preventDefault();
    if (getFormError(form)) return;

    setItems((current) => [makeItem(form), ...current]);
    setForm(defaultForm);
    setShowAdd(false);
  }

  function checkIn(id) {
    const timestamp = currentTimestamp();

    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (timestamp - item.lastCheckedAt < COOLDOWN_MS) return item;

        const log = sortLog([timestamp, ...item.log]);
        return { ...item, log, lastCheckedAt: log[0] };
      })
    );

    setNow(timestamp);
  }

  function retroCheckIn(id, timestamp) {
    const nowTimestamp = currentTimestamp();
    if (!Number.isFinite(timestamp) || timestamp > nowTimestamp) return;

    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const log = sortLog([timestamp, ...item.log]);
        return { ...item, log, lastCheckedAt: log[0] };
      })
    );

    setNow(nowTimestamp);
  }

  function deleteItem(id) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (openLogId === id) setOpenLogId(null);
    if (editingId === id) setEditingId(null);
  }

  function togglePause(id) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, pausedAt: item.pausedAt == null ? currentTimestamp() : null }
          : item
      )
    );
  }

  function completeItem(id) {
    const completedAt = currentTimestamp();
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (!item) return current;

      setCompletedItems((completed) => [
        { ...item, pausedAt: null, completedAt },
        ...completed,
      ]);

      return current.filter((entry) => entry.id !== id);
    });

    if (openLogId === id) setOpenLogId(null);
    if (editingId === id) setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm(createFormState(item));
  }

  function saveEdit(id) {
    if (getFormError(editForm)) return;

    const normalized = withComputedDurations(editForm);

    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...normalized } : item))
    );
    setEditingId(null);
  }

  function clearAll() {
    setItems([]);
    setCompletedItems([]);
    setOpenLogId(null);
    setEditingId(null);
    setShowAdd(false);
    setShowSettings(false);
    setShowClearConfirm(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COMPLETED_KEY);
    notifiedRef.current = {};
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "done");
    setShowOnboarding(false);
    if (shouldShowAlertPromptInitially()) {
      setShowAlertPrompt(true);
    }
  }

  function dismissAlertPromptForSession() {
    sessionStorage.setItem(ALERT_SESSION_KEY, "true");
    setAlertMessage("");
    setShowAlertPrompt(false);
  }

  function neverShowAlertPrompt() {
    localStorage.setItem(ALERT_NEVER_KEY, "true");
    setAlertMessage("");
    setShowAlertPrompt(false);
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <Header
          stats={stats}
          sortMode={sortMode}
          onSortChange={setSortMode}
          onAdd={() => setShowAdd((value) => !value)}
          onSettings={() => setShowSettings(true)}
        />

        <AnimatePresence initial={false}>
          {showAdd && (
            <AddPanel
              form={form}
              setForm={setForm}
              onSubmit={addItem}
              onClose={() => setShowAdd(false)}
            />
          )}
        </AnimatePresence>

        {sortedItems.length === 0 ? (
          <EmptyState showAdd={showAdd} onAdd={() => setShowAdd(true)} />
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {sortedItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                now={now}
                isEditing={editingId === item.id}
                editForm={editForm}
                setEditForm={setEditForm}
                logOpen={openLogId === item.id}
                onCheckIn={() => checkIn(item.id)}
                onPauseToggle={() => togglePause(item.id)}
                onRetroCheckIn={(timestamp) => retroCheckIn(item.id, timestamp)}
                onComplete={() => completeItem(item.id)}
                onDelete={() => deleteItem(item.id)}
                onEdit={() => startEdit(item)}
                onSaveEdit={() => saveEdit(item.id)}
                onCancelEdit={() => setEditingId(null)}
                onToggleLog={() =>
                  setOpenLogId(openLogId === item.id ? null : item.id)
                }
              />
            ))}
          </section>
        )}
      </main>

      <AnimatePresence>
        {showAlertPrompt && (
          <AlertPrompt
            loading={alertsLoading}
            message={alertMessage}
            onYes={requestAlerts}
            onNo={dismissAlertPromptForSession}
            onNever={neverShowAlertPrompt}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOnboarding && <OnboardingModal onClose={finishOnboarding} />}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            permission={permission}
            alertsOn={permission === "granted" && settings.alertsEnabled}
            alertsLoading={alertsLoading}
            alertMessage={alertMessage}
            completedItems={completedItems}
            showClearConfirm={showClearConfirm}
            onClose={() => {
              setShowSettings(false);
              setShowClearConfirm(false);
            }}
            onRequestAlerts={requestAlerts}
            onDisableAlerts={() => {
              setSettings((current) => ({ ...current, alertsEnabled: false }));
              setAlertMessage("");
            }}
            onShowOnboarding={() => {
              setShowSettings(false);
              setShowOnboarding(true);
            }}
            onShowClearConfirm={() => setShowClearConfirm(true)}
            onHideClearConfirm={() => setShowClearConfirm(false)}
            onClearAll={clearAll}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ stats, sortMode, onSortChange, onAdd, onSettings }) {
  return (
    <header className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Check-ins</h1>
          <ItemMeta stats={stats} />
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <SortDropdown sortMode={sortMode} onSortChange={onSortChange} />
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          >
            <I.plus size={16} />
            Add item
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            <I.gear size={15} />
            Settings
          </button>
        </div>
      </div>
    </header>
  );
}

function SortDropdown({ sortMode, onSortChange }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const options = [
    { value: "urgency", label: "Urgency" },
    { value: "checkins", label: "Check-ins" },
    { value: "alphabetical", label: "A-Z" },
  ];
  const selected = options.find((option) => option.value === sortMode) ?? options[0];

  function choose(value) {
    onSortChange(value);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-stone-500">Sort</span>
        <span className="font-semibold text-stone-900">{selected.label}</span>
        <I.down
          size={16}
          className={`text-stone-500 transition-transform duration-200 ease-out ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option.value)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-stone-100 ${
                  sortMode === option.value
                    ? "font-semibold text-stone-950"
                    : "text-stone-700"
                }`}
                role="option"
                aria-selected={sortMode === option.value}
              >
                <span>{option.label}</span>
                {sortMode === option.value && <CheckIcon size={14} className="text-stone-400" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddPanel({ form, setForm, onSubmit, onClose }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Add item</h2>
          <p className="mt-1 text-sm text-stone-500">
            Set the cadence you want, then track when you actually touch it.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
        >
          <I.close size={18} />
        </button>
      </div>
      <ItemForm
        form={form}
        setForm={setForm}
        onSubmit={onSubmit}
        submitText="Add item"
        submitIcon="plus"
        suppressErrorText
      />
    </motion.section>
  );
}

function EmptyState({ showAdd, onAdd }) {
  return (
    <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-center shadow-sm">
      <p className="text-sm text-stone-600">No items yet.</p>
      {!showAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
        >
          <I.plus size={16} />
          Add item
        </button>
      )}
    </section>
  );
}

function ItemForm({
  form,
  setForm,
  onSubmit,
  submitText,
  submitIcon,
  suppressErrorText = false,
}) {
  const SubmitIcon = submitIcon === "save" ? I.save : I.plus;
  const formError = getFormError(form);
  const hasMax = form.maxEnabled !== false;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-stone-700">Item</span>
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Exercise, reading, project work..."
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-stone-500"
        />
      </label>

      <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-stone-700">Target gap</p>
              <span className="invisible inline-flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">
                Enabled
              </span>
            </div>
            <DurationInput
              label=""
              amount={form.targetAmount}
              unit={form.targetUnit}
              onAmount={(value) => setForm({ ...form, targetAmount: value })}
              onUnit={(value) => setForm({ ...form, targetUnit: value })}
            />
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-stone-700">Max gap</p>
              <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={hasMax}
                  onChange={(event) =>
                    setForm({ ...form, maxEnabled: event.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-stone-300 text-stone-900 focus:ring-0"
                />
                <span className="font-medium">Enabled</span>
              </label>
            </div>
            <DurationInput
              label={hasMax ? "" : "Max gap disabled"}
              amount={form.maxAmount}
              unit={form.maxUnit}
              disabled={!hasMax}
              onAmount={(value) => setForm({ ...form, maxAmount: value })}
              onUnit={(value) => setForm({ ...form, maxUnit: value })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-stone-200 pt-4">
        <button
          type="submit"
          disabled={Boolean(formError)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          <SubmitIcon size={16} />
          {submitText}
        </button>
      </div>
      {!suppressErrorText && formError && (
        <p className="text-sm text-red-700">{formError}</p>
      )}
    </form>
  );
}

function DurationInput({ label, amount, unit, disabled = false, onAmount, onUnit }) {
  return (
    <label className="block">
      {label && (
        <span className={`mb-1.5 block text-sm font-medium ${disabled ? "text-stone-400" : "text-stone-700"}`}>
          {label}
        </span>
      )}
      <div
        className={`grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl border ${
          disabled
            ? "border-stone-200 bg-stone-50"
            : "border-stone-300 bg-white focus-within:border-stone-500"
        }`}
      >
        <input
          type="number"
          min="1"
          value={amount}
          disabled={disabled}
          onChange={(event) => onAmount(event.target.value)}
          className="min-w-0 bg-transparent px-4 py-3 outline-none disabled:text-stone-400"
        />
        <select
          value={unit}
          disabled={disabled}
          onChange={(event) => onUnit(event.target.value)}
          className="border-l border-stone-300 bg-stone-50 px-3 outline-none disabled:border-stone-200 disabled:text-stone-400"
        >
          <option value="days">days</option>
          <option value="weeks">weeks</option>
        </select>
      </div>
    </label>
  );
}

function ItemCard({
  item,
  now,
  isEditing,
  editForm,
  setEditForm,
  logOpen,
  onCheckIn,
  onPauseToggle,
  onRetroCheckIn,
  onComplete,
  onDelete,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleLog,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [retroOpen, setRetroOpen] = useState(false);
  const menuRef = useRef(null);
  const [retroValue, setRetroValue] = useState(() =>
    toDateTimeLocalValue(currentTimestamp() - 3600000)
  );
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = getStatus(item, now);
  const maxAt = item.maxEnabled === false || item.maxMs == null ? null : item.lastCheckedAt + item.maxMs;
  const targetAt = item.lastCheckedAt + item.targetMs;
  const retroMax = toDateTimeLocalValue(now);

  function submitRetro(event) {
    event.preventDefault();
    onRetroCheckIn(new Date(retroValue).getTime());
    setRetroOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  if (isEditing) {
    return (
      <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <ItemForm
          form={editForm}
          setForm={setEditForm}
          onSubmit={(event) => {
            event.preventDefault();
            onSaveEdit();
          }}
          submitText="Save"
          submitIcon="save"
        />
        <button
          type="button"
          onClick={onCancelEdit}
          className="mt-3 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
      </article>
    );
  }

  return (
    <motion.article
      layout
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{item.name}</h2>
            <TargetSummary item={item} />
          </div>
          <div className={`shrink-0 pt-0.5 text-sm font-semibold ${toneClass(status.tone)}`}>
            {status.label}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between gap-3 text-sm">
            <span className="font-medium text-stone-800">
              {formatDuration(status.elapsed)} since {status.hasCheckIns ? "last check-in" : "created"}
            </span>
            <span className="text-stone-500">{status.maxText}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
            <motion.div
              initial={false}
              animate={{ width: `${status.maxProgress * 100}%` }}
              className={`h-full rounded-full ${barClass(status.tone)}`}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-stone-500">
            <span>{status.targetText}</span>
            <span>{maxAt == null ? "No max gap" : `Max: ${formatDateTime(maxAt)}`}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600 sm:grid-cols-2">
          <div>
            Target: {formatDateTime(targetAt)}
          </div>
          <div>
            {status.hasCheckIns ? `Last check-in: ${formatDateTime(item.lastCheckedAt)}` : `Created: ${formatDateTime(item.createdAt)}`}
          </div>
        </div>

        <div ref={menuRef} className="relative mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={status.isPaused ? onPauseToggle : onCheckIn}
            disabled={!status.isPaused && !status.canCheckIn}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
              status.isPaused || status.canCheckIn
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "cursor-not-allowed bg-stone-100 text-stone-500"
            }`}
          >
            <I.check size={17} />
            {status.isPaused
              ? "Resume"
              : status.canCheckIn
              ? "Check in"
              : `Available in ${formatDuration(status.cooldownRemaining)}`}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="h-10 w-10 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          >
            <I.dots size={16} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <Menu
                onLog={() => {
                  setMenuOpen(false);
                  onToggleLog();
                }}
                onRetro={() => {
                  setMenuOpen(false);
                  setRetroOpen(true);
                }}
                onPause={() => {
                  setMenuOpen(false);
                  onPauseToggle();
                }}
                onEdit={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                onComplete={() => {
                  setMenuOpen(false);
                  setConfirmComplete(true);
                }}
                onDelete={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
                logCount={item.log.length}
                isPaused={status.isPaused}
              />
            )}
          </AnimatePresence>
        </div>

        {confirmComplete && (
          <ConfirmComplete
            onCancel={() => setConfirmComplete(false)}
            onConfirm={onComplete}
          />
        )}
        {confirmDelete && (
          <ConfirmDelete
            onCancel={() => setConfirmDelete(false)}
            onConfirm={onDelete}
          />
        )}
        {retroOpen && (
          <RetroForm
            value={retroValue}
            setValue={setRetroValue}
            maxValue={retroMax}
            onSubmit={submitRetro}
            onClose={() => setRetroOpen(false)}
            itemId={item.id}
          />
        )}
      </div>
      {logOpen && <Logbook log={item.log} />}
    </motion.article>
  );
}

function Menu({ onLog, onRetro, onPause, onEdit, onComplete, onDelete, logCount, isPaused }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-12 right-0 z-10 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
    >
      <button
        type="button"
        onClick={onLog}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"
      >
        <I.book size={16} />
        Logbook ({logCount})
      </button>
      <button
        type="button"
        onClick={onRetro}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"
      >
        <I.clock size={16} />
        Past check-in
      </button>
      <button
        type="button"
        onClick={onPause}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"
      >
        <I.clock size={16} />
        {isPaused ? "Resume item" : "Pause item"}
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"
      >
        <I.edit size={16} />
        Edit item
      </button>
      <button
        type="button"
        onClick={onComplete}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
      >
        <I.check size={16} />
        Complete item
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
      >
        <I.trash size={16} />
        Delete item
      </button>
    </motion.div>
  );
}

function ConfirmComplete({ onCancel, onConfirm }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-sm font-semibold text-emerald-800">Complete this item?</p>
      <p className="mt-1 text-sm text-emerald-700">
        This moves it and its logbook into the archive in Settings.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Complete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfirmDelete({ onCancel, onConfirm }) {
  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-800">Delete this item?</p>
      <p className="mt-1 text-sm text-red-700">This also removes its logbook.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RetroForm({ value, setValue, maxValue, onSubmit, onClose, itemId }) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={`retro-${itemId}`} className="text-sm font-semibold">
          Past check-in
        </label>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
        >
          <I.close size={16} />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          id={`retro-${itemId}`}
          type="datetime-local"
          max={maxValue}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
        <button
          type="submit"
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
        >
          Add check-in
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        The timer uses the newest check-in.
      </p>
    </form>
  );
}

function Logbook({ log }) {
  return (
    <div className="border-t border-stone-200 bg-stone-50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        Logbook
      </h3>
      <div className="max-h-56 space-y-2 overflow-auto pr-1">
        {log.map((timestamp, index) => (
          <div
            key={`${timestamp}-${index}`}
            className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          >
            <span>Check-in #{log.length - index}</span>
            <span className="text-stone-500">{formatDateTime(timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertPrompt({ loading, message, onYes, onNo, onNever }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border border-stone-200 bg-white p-4 shadow-xl"
    >
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-100">
          <I.bell size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Enable alerts?</h2>
          <p className="mt-1 text-sm text-stone-600">
            Get reminders when an item reaches its target or max gap while this page
            is open.
          </p>
          {loading && (
            <p className="mt-2 flex items-center gap-2 text-sm text-stone-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800" />
              Checking browser permission...
            </p>
          )}
          {message && !loading && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {message}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onYes}
              disabled={loading}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {loading ? "Checking..." : "Enable"}
            </button>
            <button
              type="button"
              onClick={onNo}
              disabled={loading}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Later
            </button>
            <button
              type="button"
              onClick={onNever}
              disabled={loading}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Never ask again
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Modal({ title, children, onClose, wide = false, slightlyWide = false }) {
  const widthClass = wide ? "max-w-2xl" : slightlyWide ? "max-w-[488px]" : "max-w-md";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/20 p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className={`w-full ${widthClass} rounded-2xl border border-stone-200 bg-white p-4 shadow-xl`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
          >
            <I.close size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function OnboardingModal({ onClose }) {
  return (
    <Modal title="Welcome to Check-ins" onClose={onClose} slightlyWide>
      <div className="space-y-3 text-sm text-stone-600">
        <p>
          This tracker is used to keep long-term projects from dying. By
          documenting when you work on them, you can visualize and remember what
          projects you have not worked on for a while.
        </p>
        <div className="grid gap-2 rounded-xl bg-stone-50 p-3">
          <p>
            <strong className="text-stone-900">Target gap:</strong> your goal for
            how often you should work on a project.
          </p>
          <p>
            <strong className="text-stone-900">Max gap:</strong> the longest you
            want to go without touching it.
          </p>
          <p>
            <strong className="text-stone-900">Check in:</strong> one click resets
            the timer and adds a logbook entry.
          </p>
        </div>
        <p>Each item has a 30 minute cooldown on check-ins.</p>
        <div className="rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-600">
          <p>
            Pin this tab to keep Check-ins visible. The favicon dot changes color
            when projects become due or over max.
          </p>
          <p className="mt-2 text-stone-500">
            This only updates while the page is open. Browsers may pause inactive
            tabs, and closed tabs cannot run reminders.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700"
        >
          Start tracking!
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({
  permission,
  alertsOn,
  alertsLoading,
  alertMessage,
  completedItems,
  showClearConfirm,
  onClose,
  onRequestAlerts,
  onDisableAlerts,
  onShowOnboarding,
  onShowClearConfirm,
  onHideClearConfirm,
  onClearAll,
}) {
  const [tab, setTab] = useState("general");

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-stone-200 pb-3">
          <button
            type="button"
            onClick={() => setTab("general")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "general"
                ? "bg-stone-900 text-white"
                : "border border-stone-200 text-stone-700 hover:bg-stone-100"
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setTab("archive")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "archive"
                ? "bg-stone-900 text-white"
                : "border border-stone-200 text-stone-700 hover:bg-stone-100"
            }`}
          >
            Archive ({completedItems.length})
          </button>
        </div>

        {tab === "archive" ? (
          <section className="rounded-xl border border-stone-200 p-3">
            <h3 className="text-sm font-semibold">Completed items</h3>
            {completedItems.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">No completed items yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {completedItems.map((item) => (
                  <div
                    key={`${item.id}-${item.completedAt ?? item.createdAt}`}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-stone-900">{item.name}</h4>
                        <p className="mt-1 text-xs text-stone-500">
                          Completed {formatDateTime(item.completedAt ?? item.lastCheckedAt)}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-emerald-700">Complete</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                      <p>
                        Target gap: {item.targetAmount} {item.targetUnit}
                      </p>
                      <p>
                        Max gap: {item.maxEnabled === false ? "Off" : `${item.maxAmount} ${item.maxUnit}`}
                      </p>
                      <p>Created: {formatDateTime(item.createdAt)}</p>
                      <p>
                        {item.log.length > 0
                          ? `Last check-in: ${formatDateTime(item.lastCheckedAt)}`
                          : "No check-ins recorded"}
                      </p>
                    </div>
                    <p className="mt-3 text-xs text-stone-500">
                      {item.log.length} check-in{item.log.length === 1 ? "" : "s"} recorded
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
        <section className="rounded-xl border border-stone-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Browser alerts</h3>
              <p className="mt-1 text-sm text-stone-600">
                Alerts are {alertsOn ? "on" : "off"}. They only run while this page
                is open.
              </p>
              {permission === "denied" && (
                <p className="mt-1 text-sm text-red-700">
                  Your browser blocked alerts for this site.
                </p>
              )}
              {alertMessage && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {alertMessage}
                </p>
              )}
            </div>
            {alertsOn ? (
              <button
                type="button"
                onClick={onDisableAlerts}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
              >
                Turn off
              </button>
            ) : (
              <button
                type="button"
                onClick={onRequestAlerts}
                disabled={alertsLoading}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {alertsLoading ? "Checking..." : "Turn on"}
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 p-3">
          <h3 className="text-sm font-semibold">Help</h3>
          <div className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            <p>
              Pin this tab to keep Check-ins visible. The favicon dot changes color
              when projects become due or over max.
            </p>
            <p className="mt-2 text-stone-500">
              This only updates while the page is open. Browsers may pause inactive
              tabs, and closed tabs cannot run reminders.
            </p>
          </div>
          <button
            type="button"
            onClick={onShowOnboarding}
            className="mt-3 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
          >
            Show onboarding
          </button>
        </section>

        <section className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">
            Delete every item and logbook entry from this browser.
          </p>
          {!showClearConfirm ? (
            <button
              type="button"
              onClick={onShowClearConfirm}
              className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
            >
              Clear all data
            </button>
          ) : (
            <div className="mt-3 rounded-lg border border-red-200 bg-white p-3">
              <p className="text-sm font-medium text-red-800">Are you sure?</p>
              <p className="mt-1 text-sm text-red-700">
                This removes every item and logbook entry.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onClearAll}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
                >
                  Yes, clear everything
                </button>
                <button
                  type="button"
                  onClick={onHideClearConfirm}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="border-t border-stone-200 pt-3 text-xs text-stone-400">
          <p>By Christopher Heskett</p>
          <p>4/2026</p>
          <a
            href="https://github.com/Chrissyuh/check-ins"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-stone-500 underline decoration-stone-300 underline-offset-2 transition hover:text-stone-900"
          >
            GitHub repository
          </a>
        </div>
          </>
        )}
      </div>
    </Modal>
  );
}
