import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "checkins.items.v2";
const SETTINGS_KEY = "checkins.settings.v2";
const ONBOARDING_KEY = "checkins.onboarding.done.v2";
const ALERT_NEVER_KEY = "checkins.alerts.never.v2";
const ALERT_SESSION_KEY = "checkins.alerts.dismissed.session.v2";
const COOLDOWN_MS = 30 * 60 * 1000;

const defaultSettings = { alertsEnabled: false };
const defaultForm = { name: "", targetAmount: 2, targetUnit: "days", maxAmount: 5, maxUnit: "days" };

function Icon({ children, size = 18, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center leading-none ${className}`} style={{ width: size, height: size, fontSize: size * 0.9 }} aria-hidden="true">
      {children}
    </span>
  );
}

function ChevronDown({ size = 16, className = "" }) {
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
        d="M5.5 7.5L10 12L14.5 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const I = {
  plus: (p) => <Icon {...p}>+</Icon>,
  check: (p) => <Icon {...p}>✓</Icon>,
  clock: (p) => <Icon {...p}>◷</Icon>,
  trash: (p) => <Icon {...p}>🗑</Icon>,
  edit: (p) => <Icon {...p}>✎</Icon>,
  close: (p) => <Icon {...p}>×</Icon>,
  save: (p) => <Icon {...p}>▣</Icon>,
  book: (p) => <Icon {...p}>▤</Icon>,
  warn: (p) => <Icon {...p}>!</Icon>,
  bell: (p) => <Icon {...p}>◉</Icon>,
  dots: (p) => <Icon {...p}>⋯</Icon>,
  gear: (p) => <Icon {...p}>⚙</Icon>,
  down: (p) => <ChevronDown {...p} />,
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function unitsToMs(amount, unit) {
  const n = Number(amount) || 0;
  const day = 24 * 60 * 60 * 1000;
  if (unit === "weeks") return n * 7 * day;
  return n * day;
}

function formatDuration(ms) {
  if (ms <= 0) return "now";
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(ms / 3600000);
  const day = Math.floor(ms / 86400000);
  if (min < 60) return `${Math.max(1, min)} min`;
  if (hr < 48) return `${hr} hr${hr === 1 ? "" : "s"}`;
  if (day < 14) return `${day} day${day === 1 ? "" : "s"}`;
  const week = Math.floor(day / 7);
  return `${week} week${week === 1 ? "" : "s"}`;
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function toDateTimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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

function makeItem(form) {
  const now = Date.now();
  const targetMs = unitsToMs(form.targetAmount, form.targetUnit);
  const maxMs = Math.max(unitsToMs(form.maxAmount, form.maxUnit), targetMs);
  return {
    id: uid(),
    name: form.name.trim(),
    targetAmount: Number(form.targetAmount),
    targetUnit: form.targetUnit,
    maxAmount: Number(form.maxAmount),
    maxUnit: form.maxUnit,
    targetMs,
    maxMs,
    createdAt: now,
    lastCheckedAt: now,
    log: [now],
  };
}

function normalizeItem(item) {
  const targetMs = item.targetMs ?? unitsToMs(item.targetAmount, item.targetUnit);
  const maxMs = Math.max(item.maxMs ?? unitsToMs(item.maxAmount, item.maxUnit), targetMs);
  const log = sortLog(Array.isArray(item.log) ? item.log : [item.lastCheckedAt ?? Date.now()]);
  return { ...item, targetMs, maxMs, log, lastCheckedAt: log[0] ?? Date.now() };
}

function getStatus(item, now) {
  const elapsed = now - item.lastCheckedAt;
  const targetRemaining = item.targetMs - elapsed;
  const maxRemaining = item.maxMs - elapsed;
  const targetProgress = item.targetMs > 0 ? elapsed / item.targetMs : 1;
  const maxProgress = item.maxMs > 0 ? elapsed / item.maxMs : 1;
  const isOverMax = elapsed >= item.maxMs;
  const isDue = elapsed >= item.targetMs;
  const canCheckIn = elapsed >= COOLDOWN_MS;

  let label = "Fresh";
  let tone = "fresh";
  let alertLevel = "fresh";
  let targetText = `${formatDuration(targetRemaining)} until target`;
  let maxText = `${formatDuration(maxRemaining)} until max`;

  if (isOverMax) {
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
    targetRemaining,
    maxRemaining,
    cooldownRemaining: COOLDOWN_MS - elapsed,
    targetProgress: clamp(targetProgress, 0, 1),
    maxProgress: clamp(maxProgress, 0, 1),
    isDue,
    isOverMax,
    canCheckIn,
    label,
    tone,
    alertLevel,
    targetText,
    maxText,
  };
}

function toneClass(tone) {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "due") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "soon") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function barClass(tone) {
  if (tone === "danger") return "bg-red-500";
  if (tone === "due") return "bg-amber-500";
  if (tone === "soon") return "bg-yellow-500";
  return "bg-emerald-500";
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
  console.assert(getStatus(fake, base + 20 * 60000).canCheckIn === false, "cooldown blocks early check-ins");
  console.assert(getStatus(fake, base + 31 * 60000).canCheckIn === true, "cooldown allows later check-ins");
  console.assert(getStatus(fake, base + 3 * 3600000).isOverMax === true, "over max status works");
}

export default function App() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [settings, setSettings] = useState(defaultSettings);
  const [permission, setPermission] = useState("unsupported");
  const [now, setNow] = useState(Date.now());
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAlertPrompt, setShowAlertPrompt] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [openLogId, setOpenLogId] = useState(null);
  const [sortMode, setSortMode] = useState("urgency");
  const [notified, setNotified] = useState({});

  useEffect(() => {
    runSanityTests();
    const savedItems = readJson(STORAGE_KEY, []);
    if (Array.isArray(savedItems)) setItems(savedItems.map(normalizeItem));
    setSettings({ ...defaultSettings, ...readJson(SETTINGS_KEY, defaultSettings) });
    if ("Notification" in window) setPermission(Notification.permission);
    if (localStorage.getItem(ONBOARDING_KEY) !== "done") setShowOnboarding(true);
  }, []);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(items)), [items]);
  useEffect(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (showOnboarding || !("Notification" in window) || Notification.permission !== "default") return;
    const never = localStorage.getItem(ALERT_NEVER_KEY) === "true";
    const dismissed = sessionStorage.getItem(ALERT_SESSION_KEY) === "true";
    if (!never && !dismissed) setShowAlertPrompt(true);
  }, [showOnboarding]);

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
      if (hideTimer) window.clearTimeout(hideTimer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [showAlertPrompt, alertsLoading, alertMessage]);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !settings.alertsEnabled) return;
    const next = { ...notified };
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
    if (changed) setNotified(next);
  }, [items, now, settings.alertsEnabled, notified]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sortMode === "alphabetical") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      if (sortMode === "checkins") {
        if (b.log.length !== a.log.length) return b.log.length - a.log.length;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      const sa = getStatus(a, now);
      const sb = getStatus(b, now);
      if (sa.isOverMax !== sb.isOverMax) return sa.isOverMax ? -1 : 1;
      if (sa.isDue !== sb.isDue) return sa.isDue ? -1 : 1;
      if (sb.maxProgress !== sa.maxProgress) return sb.maxProgress - sa.maxProgress;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [items, now, sortMode]);

  const stats = useMemo(() => {
    const statuses = items.map((item) => getStatus(item, now));
    return {
      total: items.length,
      fresh: statuses.filter((s) => !s.isDue).length,
      due: statuses.filter((s) => s.isDue && !s.isOverMax).length,
      overMax: statuses.filter((s) => s.isOverMax).length,
      logs: items.reduce((sum, item) => sum + item.log.length, 0),
    };
  }, [items, now]);

  async function requestAlerts() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setSettings((s) => ({ ...s, alertsEnabled: false }));
      setAlertMessage("This browser does not support alerts.");
      return;
    }

    setAlertsLoading(true);
    setAlertMessage("");

    try {
      // Some browsers may show their own blocked-permission UI without resolving
      // requestPermission() right away, so we race it against a short timeout.
      const permissionRequest = Notification.requestPermission().catch(() => null);
      await Promise.race([
        permissionRequest,
        new Promise((resolve) => setTimeout(resolve, 1100)),
      ]);

      const finalPermission = Notification.permission;
      setPermission(finalPermission);

      if (finalPermission === "granted") {
        setSettings((s) => ({ ...s, alertsEnabled: true }));
        setShowAlertPrompt(false);
        setAlertMessage("");
        new Notification("Alerts enabled", { body: "Reminders will appear while this page is open." });
      } else {
        setSettings((s) => ({ ...s, alertsEnabled: false }));
        setShowAlertPrompt(true);
        setAlertMessage("Alerts were not enabled. Check browser settings for this site, allow notifications, then try again.");
      }
    } finally {
      setAlertsLoading(false);
    }
  }

  function addItem(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setItems((prev) => [makeItem(form), ...prev]);
    setForm(defaultForm);
    setShowAdd(false);
  }

  function checkIn(id) {
    const timestamp = Date.now();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (timestamp - item.lastCheckedAt < COOLDOWN_MS) return item;
        const log = sortLog([timestamp, ...item.log]);
        return { ...item, log, lastCheckedAt: log[0] };
      })
    );
    setNow(timestamp);
  }

  function retroCheckIn(id, timestamp) {
    if (!Number.isFinite(timestamp) || timestamp > Date.now()) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const log = sortLog([timestamp, ...item.log]);
        return { ...item, log, lastCheckedAt: log[0] };
      })
    );
    setNow(Date.now());
  }

  function deleteItem(id) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (openLogId === id) setOpenLogId(null);
    if (editingId === id) setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({ name: item.name, targetAmount: item.targetAmount, targetUnit: item.targetUnit, maxAmount: item.maxAmount, maxUnit: item.maxUnit });
  }

  function saveEdit(id) {
    if (!editForm.name.trim()) return;
    const targetMs = unitsToMs(editForm.targetAmount, editForm.targetUnit);
    const maxMs = Math.max(unitsToMs(editForm.maxAmount, editForm.maxUnit), targetMs);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...editForm, name: editForm.name.trim(), targetAmount: Number(editForm.targetAmount), maxAmount: Number(editForm.maxAmount), targetMs, maxMs } : item)));
    setEditingId(null);
  }

  function clearAll() {
    setItems([]);
    setOpenLogId(null);
    setEditingId(null);
    setShowAdd(false);
    setShowSettings(false);
    setShowClearConfirm(false);
    localStorage.removeItem(STORAGE_KEY);
    setNotified({});
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "done");
    setShowOnboarding(false);
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <Header stats={stats} sortMode={sortMode} onSortChange={setSortMode} onAdd={() => setShowAdd((v) => !v)} onSettings={() => setShowSettings(true)} />

        <AnimatePresence initial={false}>
          {showAdd && (
            <AddPanel form={form} setForm={setForm} onSubmit={addItem} onClose={() => setShowAdd(false)} />
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
                onRetroCheckIn={(timestamp) => retroCheckIn(item.id, timestamp)}
                onDelete={() => deleteItem(item.id)}
                onEdit={() => startEdit(item)}
                onSaveEdit={() => saveEdit(item.id)}
                onCancelEdit={() => setEditingId(null)}
                onToggleLog={() => setOpenLogId(openLogId === item.id ? null : item.id)}
              />
            ))}
          </section>
        )}
      </main>

      <AnimatePresence>{showAlertPrompt && <AlertPrompt loading={alertsLoading} message={alertMessage} onYes={requestAlerts} onNo={() => { sessionStorage.setItem(ALERT_SESSION_KEY, "true"); setAlertMessage(""); setShowAlertPrompt(false); }} onNever={() => { localStorage.setItem(ALERT_NEVER_KEY, "true"); setAlertMessage(""); setShowAlertPrompt(false); }} />}</AnimatePresence>
      <AnimatePresence>{showOnboarding && <OnboardingModal onClose={finishOnboarding} />}</AnimatePresence>
      <AnimatePresence>{showSettings && <SettingsModal permission={permission} alertsOn={permission === "granted" && settings.alertsEnabled} alertsLoading={alertsLoading} alertMessage={alertMessage} showClearConfirm={showClearConfirm} onClose={() => { setShowSettings(false); setShowClearConfirm(false); }} onRequestAlerts={requestAlerts} onDisableAlerts={() => { setSettings((s) => ({ ...s, alertsEnabled: false })); setAlertMessage(""); }} onShowOnboarding={() => { setShowSettings(false); setShowOnboarding(true); }} onShowClearConfirm={() => setShowClearConfirm(true)} onHideClearConfirm={() => setShowClearConfirm(false)} onClearAll={clearAll} />}</AnimatePresence>
    </div>
  );
}

function Header({ stats, sortMode, onSortChange, onAdd, onSettings }) {
  return (
    <header className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Check-ins</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
            <span><strong className="text-stone-900">{stats.total}</strong> items</span><span className="text-stone-300">•</span>
            <span><strong className="text-emerald-700">{stats.fresh}</strong> fresh</span><span className="text-stone-300">•</span>
            <span><strong className="text-amber-700">{stats.due}</strong> due</span><span className="text-stone-300">•</span>
            <span><strong className="text-red-700">{stats.overMax}</strong> over max</span><span className="text-stone-300">•</span>
            <span><strong className="text-stone-900">{stats.logs}</strong> check-ins</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <SortDropdown sortMode={sortMode} onSortChange={onSortChange} />
          <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"><I.plus size={16} />Add item</button>
          <button onClick={onSettings} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"><I.gear size={15} />Settings</button>
        </div>
      </div>
    </header>
  );
}

function SortDropdown({ sortMode, onSortChange }) {
  const [open, setOpen] = useState(false);
  const options = [
    { value: "urgency", label: "Urgency" },
    { value: "checkins", label: "Check-ins" },
    { value: "alphabetical", label: "A–Z" },
  ];
  const selected = options.find((option) => option.value === sortMode) ?? options[0];

  function choose(value) {
    onSortChange(value);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-stone-500">Sort</span>
        <span className="font-semibold text-stone-900">{selected.label}</span>
        <I.down size={16} className={`text-stone-500 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`} />
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
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-stone-100 ${sortMode === option.value ? "font-semibold text-stone-950" : "text-stone-700"}`}
                role="option"
                aria-selected={sortMode === option.value}
              >
                <span>{option.label}</span>
                {sortMode === option.value && <span className="text-stone-400">✓</span>}
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
    <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Add item</h2><button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><I.close size={18} /></button></div>
      <ItemForm form={form} setForm={setForm} onSubmit={onSubmit} submitText="Add item" />
    </motion.section>
  );
}

function EmptyState({ showAdd, onAdd }) {
  return (
    <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-center shadow-sm">
      <p className="text-sm text-stone-600">No items yet.</p>
      {!showAdd && <button onClick={onAdd} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"><I.plus size={16} />Add item</button>}
    </section>
  );
}

function ItemForm({ form, setForm, onSubmit, submitText }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
      <label className="block"><span className="mb-1.5 block text-sm font-medium text-stone-700">Item</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Exercise, reading, project work..." className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-500" /></label>
      <DurationInput label="Target gap" amount={form.targetAmount} unit={form.targetUnit} onAmount={(v) => setForm({ ...form, targetAmount: v })} onUnit={(v) => setForm({ ...form, targetUnit: v })} />
      <DurationInput label="Max gap" amount={form.maxAmount} unit={form.maxUnit} onAmount={(v) => setForm({ ...form, maxAmount: v })} onUnit={(v) => setForm({ ...form, maxUnit: v })} />
      <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-700"><I.plus size={16} />{submitText}</button>
    </form>
  );
}

function DurationInput({ label, amount, unit, onAmount, onUnit }) {
  return (
    <label className="block"><span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span><div className="grid grid-cols-[1fr_auto] overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:border-stone-500"><input type="number" min="1" value={amount} onChange={(e) => onAmount(e.target.value)} className="min-w-0 bg-transparent px-3 py-2 outline-none" /><select value={unit} onChange={(e) => onUnit(e.target.value)} className="border-l border-stone-300 bg-stone-50 px-2 outline-none"><option value="days">days</option><option value="weeks">weeks</option></select></div></label>
  );
}

function ItemCard({ item, now, isEditing, editForm, setEditForm, logOpen, onCheckIn, onRetroCheckIn, onDelete, onEdit, onSaveEdit, onCancelEdit, onToggleLog }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroValue, setRetroValue] = useState(toDateTimeLocalValue(Date.now() - 3600000));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = getStatus(item, now);
  const maxAt = item.lastCheckedAt + item.maxMs;
  const targetAt = item.lastCheckedAt + item.targetMs;

  function submitRetro(e) {
    e.preventDefault();
    const ts = new Date(retroValue).getTime();
    onRetroCheckIn(ts);
    setRetroOpen(false);
  }

  if (isEditing) {
    return (
      <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <ItemForm form={editForm} setForm={setEditForm} onSubmit={(e) => { e.preventDefault(); onSaveEdit(); }} submitText="Save" />
        <button onClick={onCancelEdit} className="mt-3 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">Cancel</button>
      </article>
    );
  }

  return (
    <motion.article layout className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{item.name}</h2><p className="mt-0.5 text-sm text-stone-500">Target gap: {item.targetAmount} {item.targetUnit} · Max gap: {item.maxAmount} {item.maxUnit}</p></div><div className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(status.tone)}`}>{status.label}</div></div>
        <div className="mt-4"><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium text-stone-800">{formatDuration(status.elapsed)} since last check-in</span><span className="text-stone-500">{status.maxText}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-stone-200"><motion.div initial={false} animate={{ width: `${status.maxProgress * 100}%` }} className={`h-full rounded-full ${barClass(status.tone)}`} /></div><div className="mt-1.5 flex justify-between text-xs text-stone-500"><span>{status.targetText}</span><span>Max: {formatDateTime(maxAt)}</span></div></div>
        <div className="mt-4 grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600 sm:grid-cols-2"><div><I.clock size={15} /> Target: {formatDateTime(targetAt)}</div><div>{status.isOverMax ? <I.warn size={15} /> : <I.clock size={15} />} Last check-in: {formatDateTime(item.lastCheckedAt)}</div></div>
        <div className="relative mt-4 flex items-center gap-2"><button onClick={onCheckIn} disabled={!status.canCheckIn} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${status.canCheckIn ? "bg-emerald-600 text-white hover:bg-emerald-700" : "cursor-not-allowed bg-stone-100 text-stone-500"}`}><I.check size={17} />{status.canCheckIn ? "Check in" : `Available in ${formatDuration(status.cooldownRemaining)}`}</button><button onClick={() => setMenuOpen((v) => !v)} className="h-10 w-10 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"><I.dots size={22} /></button>{menuOpen && <Menu onLog={() => { setMenuOpen(false); onToggleLog(); }} onRetro={() => { setMenuOpen(false); setRetroOpen(true); }} onEdit={() => { setMenuOpen(false); onEdit(); }} onDelete={() => { setMenuOpen(false); setConfirmDelete(true); }} logCount={item.log.length} />}</div>
        {confirmDelete && <ConfirmDelete onCancel={() => setConfirmDelete(false)} onConfirm={onDelete} />}
        {retroOpen && <RetroForm value={retroValue} setValue={setRetroValue} onSubmit={submitRetro} onClose={() => setRetroOpen(false)} itemId={item.id} />}
      </div>
      {logOpen && <Logbook log={item.log} />}
    </motion.article>
  );
}

function Menu({ onLog, onRetro, onEdit, onDelete, logCount }) {
  return <div className="absolute bottom-12 right-0 z-10 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"><button onClick={onLog} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"><I.book size={16} />Logbook ({logCount})</button><button onClick={onRetro} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"><I.clock size={16} />Past check-in</button><button onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100"><I.edit size={16} />Edit item</button><button onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><I.trash size={16} />Delete item</button></div>;
}

function ConfirmDelete({ onCancel, onConfirm }) {
  return <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm font-semibold text-red-800">Delete this item?</p><p className="mt-1 text-sm text-red-700">This also removes its logbook.</p><div className="mt-3 flex gap-2"><button onClick={onConfirm} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800">Delete</button><button onClick={onCancel} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100">Cancel</button></div></div>;
}

function RetroForm({ value, setValue, onSubmit, onClose, itemId }) {
  return <form onSubmit={onSubmit} className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3"><div className="mb-2 flex items-center justify-between"><label htmlFor={`retro-${itemId}`} className="text-sm font-semibold">Past check-in</label><button type="button" onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><I.close size={16} /></button></div><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input id={`retro-${itemId}`} type="datetime-local" max={toDateTimeLocalValue(Date.now())} value={value} onChange={(e) => setValue(e.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500" /><button type="submit" className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">Add check-in</button></div><p className="mt-2 text-xs text-stone-500">The timer uses the newest check-in.</p></form>;
}

function Logbook({ log }) {
  return <div className="border-t border-stone-200 bg-stone-50 p-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Logbook</h3><div className="max-h-56 space-y-2 overflow-auto pr-1">{log.map((ts, index) => <div key={`${ts}-${index}`} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"><span>Check-in #{log.length - index}</span><span className="text-stone-500">{formatDateTime(ts)}</span></div>)}</div></div>;
}

function AlertPrompt({ loading, message, onYes, onNo, onNever }) {
  return <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border border-stone-200 bg-white p-4 shadow-xl"><div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-100"><I.bell size={16} /></div><div><h2 className="text-sm font-semibold">Enable alerts?</h2><p className="mt-1 text-sm text-stone-600">Get reminders when an item reaches its target or max gap while this page is open.</p>{loading && <p className="mt-2 flex items-center gap-2 text-sm text-stone-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800" />Checking browser permission...</p>}{message && !loading && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}<div className="mt-3 flex flex-wrap gap-2"><button onClick={onYes} disabled={loading} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400">{loading ? "Checking..." : "Enable"}</button><button onClick={onNo} disabled={loading} className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50">Later</button><button onClick={onNever} disabled={loading} className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50">Never ask again</button></div></div></div></motion.div>;
}

function Modal({ title, children, onClose, wide = false, slightlyWide = false }) {
  const widthClass = wide ? "max-w-2xl" : slightlyWide ? "max-w-[488px]" : "max-w-md";
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/20 p-4"><motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} className={`w-full ${widthClass} rounded-2xl border border-stone-200 bg-white p-4 shadow-xl`}><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><I.close size={18} /></button></div>{children}</motion.div></motion.div>;
}

function OnboardingModal({ onClose }) {
  return <Modal title="Welcome to Check-ins" onClose={onClose} slightlyWide><div className="space-y-3 text-sm text-stone-600"><p>This tracker is used to keep long-term projects from dying. By documenting when you work on them, you can visualize and remember what projects you have not worked on for a while.</p><div className="grid gap-2 rounded-xl bg-stone-50 p-3"><p><strong className="text-stone-900">Target gap:</strong> your goal for how often you should work on a project.</p><p><strong className="text-stone-900">Max gap:</strong> the longest you want to go without touching it.</p><p><strong className="text-stone-900">Check in:</strong> one click resets the timer and adds a logbook entry.</p></div><p>Each item has a 30 minute cooldown on check-ins.</p><button onClick={onClose} className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">Start tracking!</button></div></Modal>;
}

function SettingsModal({ permission, alertsOn, alertsLoading, alertMessage, showClearConfirm, onClose, onRequestAlerts, onDisableAlerts, onShowOnboarding, onShowClearConfirm, onHideClearConfirm, onClearAll }) {
  return <Modal title="Settings" onClose={onClose} wide><div className="space-y-4"><section className="rounded-xl border border-stone-200 p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Browser alerts</h3><p className="mt-1 text-sm text-stone-600">Alerts are {alertsOn ? "on" : "off"}. They only run while this page is open.</p>{permission === "denied" && <p className="mt-1 text-sm text-red-700">Your browser blocked alerts for this site.</p>}{alertMessage && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{alertMessage}</p>}</div>{alertsOn ? <button onClick={onDisableAlerts} className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">Turn off</button> : <button onClick={onRequestAlerts} disabled={alertsLoading} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400">{alertsLoading ? "Checking..." : "Turn on"}</button>}</div></section><section className="rounded-xl border border-stone-200 p-3"><h3 className="text-sm font-semibold">Help</h3><button onClick={onShowOnboarding} className="mt-2 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">Show onboarding</button></section><section className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm text-red-700">Delete every item and logbook entry from this browser.</p>{!showClearConfirm ? <button onClick={onShowClearConfirm} className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800">Clear all data</button> : <div className="mt-3 rounded-lg border border-red-200 bg-white p-3"><p className="text-sm font-medium text-red-800">Are you sure?</p><p className="mt-1 text-sm text-red-700">This removes every item and logbook entry.</p><div className="mt-3 flex gap-2"><button onClick={onClearAll} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800">Yes, clear everything</button><button onClick={onHideClearConfirm} className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">Cancel</button></div></div>}</section><div className="border-t border-stone-200 pt-3 text-xs text-stone-400"><p>By Christopher Heskett</p><p>4/2026</p></div></div></Modal>;
}
