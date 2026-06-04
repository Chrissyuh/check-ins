import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { daysAgoIso, formatDateTime, formatDuration, localId, nowIso } from "../src/date";
import { scheduleLocalReminder, reminderHonestyText } from "../src/notifications";
import { createEmptyWorkspace, createPreviewWorkspace } from "../src/sampleData";
import { getProjectStatus } from "../src/status";
import {
  allowLocalPreview,
  isSupabaseConfigured,
  privacyPolicyUrl,
  supabase,
  supportUrl,
  type AuthSession,
} from "../src/supabase";
import type { CheckIn, DurationUnit, Project, Task, TrackingMode, WorkspaceData } from "../src/types";

const PREVIEW_STORAGE_KEY = "checkins.v2.preview.workspace";
const localUserId = "local-preview";

function getTrackingMode(project: Project): TrackingMode {
  return project.tracking_mode ?? "both";
}

function allowsTasks(item: Project | TrackingMode): boolean {
  const mode = typeof item === "string" ? item : getTrackingMode(item);
  return mode === "todo" || mode === "both";
}

function allowsCheckIns(item: Project | TrackingMode): boolean {
  const mode = typeof item === "string" ? item : getTrackingMode(item);
  return mode === "checkin" || mode === "both";
}

type Tab = "today" | "projects" | "completed" | "settings";
type AuthMode = "signin" | "signup";
type ProjectDraft = {
  title: string;
  trackingMode: TrackingMode;
  nextAction: string;
  notes: string;
  targetAmount: string;
  targetUnit: DurationUnit;
  maxEnabled: boolean;
  maxAmount: string;
  maxUnit: DurationUnit;
};

const initialProjectDraft: ProjectDraft = {
  title: "",
  trackingMode: "both",
  nextAction: "",
  notes: "",
  targetAmount: "2",
  targetUnit: "days",
  maxEnabled: true,
  maxAmount: "5",
  maxUnit: "days",
};

export default function IndexScreen() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [localPreview, setLocalPreview] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceData>(createEmptyWorkspace);
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(initialProjectDraft);
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);

  const isRemote = Boolean(isSupabaseConfigured && session && !localPreview);
  const userId = session?.user.id ?? localUserId;

  useEffect(() => {
    let mounted = true;

    async function boot() {
      if (!supabase) {
        if (mounted) setBooting(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session);
        setBooting(false);
      }
    }

    boot();

    if (!supabase) return () => undefined;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLocalPreview(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (booting) return;

    if (localPreview && allowLocalPreview) {
      loadLocalPreview();
      return;
    }

    if (isRemote) {
      loadRemoteWorkspace();
      return;
    }

    setWorkspace(createEmptyWorkspace());
  }, [booting, isRemote, localPreview]);

  useEffect(() => {
    if (!localPreview || booting) return;
    AsyncStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(workspace)).catch(() => {
      setMessage("Could not save local preview data.");
    });
  }, [booting, localPreview, workspace]);

  const activeProjects = useMemo(
    () =>
      workspace.projects
        .filter((project) => !project.completed_at && !project.archived_at)
        .sort((a, b) => {
          const statusA = getProjectStatus(a);
          const statusB = getProjectStatus(b);
          const rank = {
            "over-max": 0,
            due: 1,
            soon: 2,
            todo: 3,
            fresh: 4,
            paused: 5,
            completed: 6,
          };
          return rank[statusA.status] - rank[statusB.status] || a.sort_order - b.sort_order;
        }),
    [workspace.projects]
  );
  const completedProjects = useMemo(
    () => workspace.projects.filter((project) => project.completed_at && !project.archived_at),
    [workspace.projects]
  );
  const todayProjects = useMemo(
    () =>
      activeProjects.filter((project) => {
        const status = getProjectStatus(project);
        const hasOpenTasks = workspace.tasks.some(
          (task) => task.project_id === project.id && task.status === "open"
        );
        const checkInNeedsAttention =
          allowsCheckIns(project) &&
          (status.status === "due" || status.status === "over-max" || status.status === "soon");
        const taskNeedsAttention = allowsTasks(project) && hasOpenTasks;
        return checkInNeedsAttention || taskNeedsAttention;
      }),
    [activeProjects, workspace.tasks]
  );
  const stats = useMemo(() => {
    const statuses = activeProjects.map((project) => getProjectStatus(project));
    const taskProjectIds = new Set(
      activeProjects.filter((project) => allowsTasks(project)).map((project) => project.id)
    );
    return {
      active: activeProjects.length,
      due: statuses.filter((status) => status.status === "due").length,
      overMax: statuses.filter((status) => status.status === "over-max").length,
      tasks: workspace.tasks.filter(
        (task) => task.status === "open" && taskProjectIds.has(task.project_id)
      ).length,
      checkIns: workspace.checkIns.length,
    };
  }, [activeProjects, workspace.checkIns.length, workspace.tasks]);

  async function loadLocalPreview() {
    const raw = await AsyncStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) {
      setWorkspace(createPreviewWorkspace());
      return;
    }

    try {
      setWorkspace(JSON.parse(raw) as WorkspaceData);
    } catch {
      setWorkspace(createPreviewWorkspace());
    }
  }

  async function loadRemoteWorkspace() {
    if (!supabase || !session) return;

    setSyncing(true);
    setMessage("");

    const [projectsResult, tasksResult, checkInsResult] = await Promise.all([
      supabase.from("projects").select("*").order("sort_order", { ascending: true }),
      supabase.from("tasks").select("*").order("sort_order", { ascending: true }),
      supabase.from("check_ins").select("*").order("occurred_at", { ascending: false }),
    ]);

    setSyncing(false);

    if (projectsResult.error || tasksResult.error || checkInsResult.error) {
      setMessage("Sync failed. Check Supabase tables, RLS policies, and env vars.");
      return;
    }

    setWorkspace({
      projects: (projectsResult.data ?? []) as Project[],
      tasks: (tasksResult.data ?? []) as Task[],
      checkIns: (checkInsResult.data ?? []) as CheckIn[],
    });
  }

  async function handleAuth() {
    if (!supabase) return;
    if (!authEmail.trim() || !authPassword) {
      setMessage("Email and password are required.");
      return;
    }

    setSyncing(true);
    setMessage("");

    const result =
      authMode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          })
        : await supabase.auth.signUp({
            email: authEmail.trim(),
            password: authPassword,
          });

    setSyncing(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (authMode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email if confirmation is enabled.");
    }
  }

  async function sendMagicLink() {
    if (!supabase || !authEmail.trim()) {
      setMessage("Enter an email address first.");
      return;
    }

    setSyncing(true);
    const result = await supabase.auth.signInWithOtp({ email: authEmail.trim() });
    setSyncing(false);
    setMessage(result.error ? result.error.message : "Magic link sent.");
  }

  async function signOut() {
    if (supabase && session) await supabase.auth.signOut();
    setSession(null);
    setLocalPreview(false);
    setWorkspace(createEmptyWorkspace());
  }

  async function addProject() {
    const title = projectDraft.title.trim();
    const canTrackTasks = allowsTasks(projectDraft.trackingMode);
    const canTrackCheckIns = allowsCheckIns(projectDraft.trackingMode);
    const targetAmount = Number(projectDraft.targetAmount);
    const maxAmount = Number(projectDraft.maxAmount);

    if (!title) {
      setMessage("Item name is required.");
      return;
    }
    if (canTrackCheckIns && (!targetAmount || targetAmount < 1)) {
      setMessage("Target gap must be at least 1 day.");
      return;
    }
    if (canTrackCheckIns && projectDraft.maxEnabled && (!maxAmount || maxAmount <= targetAmount)) {
      setMessage("Max gap must be longer than the target gap.");
      return;
    }

    const timestamp = nowIso();
    const payload = {
      user_id: userId,
      title,
      notes: projectDraft.notes.trim() || null,
      next_action: canTrackTasks ? projectDraft.nextAction.trim() || null : null,
      tracking_mode: projectDraft.trackingMode,
      target_amount: canTrackCheckIns ? targetAmount : Number(initialProjectDraft.targetAmount),
      target_unit: projectDraft.targetUnit,
      max_enabled: canTrackCheckIns ? projectDraft.maxEnabled : false,
      max_amount: canTrackCheckIns && projectDraft.maxEnabled ? maxAmount : null,
      max_unit: canTrackCheckIns && projectDraft.maxEnabled ? projectDraft.maxUnit : null,
      last_checked_at: timestamp,
      paused_at: null,
      completed_at: null,
      archived_at: null,
      sort_order: workspace.projects.length + 1,
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (isRemote && supabase) {
      const { data, error } = await supabase.from("projects").insert(payload).select("*").single();
      if (error || !data) {
        setMessage(error?.message ?? "Could not create item.");
        return;
      }
      setWorkspace((current) => ({ ...current, projects: [data as Project, ...current.projects] }));
    } else {
      setWorkspace((current) => ({
        ...current,
        projects: [{ id: localId("project"), ...payload }, ...current.projects],
      }));
    }

    setProjectDraft(initialProjectDraft);
    setActiveTab("projects");
    setMessage("Item added.");
  }

  async function patchProject(project: Project, patch: Partial<Project>) {
    const nextPatch = { ...patch, updated_at: nowIso() };

    if (isRemote && supabase) {
      const { error } = await supabase.from("projects").update(nextPatch).eq("id", project.id);
      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((entry) =>
        entry.id === project.id ? { ...entry, ...nextPatch } : entry
      ),
    }));
  }

  async function addTask(project: Project) {
    if (!allowsTasks(project)) {
      setMessage("This item is check-in only.");
      return;
    }

    const title = (newTaskTitles[project.id] ?? "").trim();
    if (!title) return;

    const timestamp = nowIso();
    const payload = {
      user_id: userId,
      project_id: project.id,
      title,
      status: "open" as const,
      priority: "normal" as const,
      due_at: null,
      completed_at: null,
      sort_order: workspace.tasks.filter((task) => task.project_id === project.id).length + 1,
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (isRemote && supabase) {
      const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();
      if (error || !data) {
        setMessage(error?.message ?? "Could not create task.");
        return;
      }
      setWorkspace((current) => ({ ...current, tasks: [...current.tasks, data as Task] }));
    } else {
      setWorkspace((current) => ({
        ...current,
        tasks: [...current.tasks, { id: localId("task"), ...payload }],
      }));
    }

    setNewTaskTitles((current) => ({ ...current, [project.id]: "" }));
  }

  async function toggleTask(task: Task) {
    const done = task.status !== "done";
    const patch = {
      status: done ? ("done" as const) : ("open" as const),
      completed_at: done ? nowIso() : null,
      updated_at: nowIso(),
    };

    if (isRemote && supabase) {
      const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((entry) => (entry.id === task.id ? { ...entry, ...patch } : entry)),
    }));
  }

  async function createCheckIn(
    project: Project,
    occurredAt = nowIso(),
    note = "Worked on this",
    linkedTask: Task | null = null,
    completeLinkedTask = false
  ) {
    if (!allowsCheckIns(project)) {
      setMessage("This item is task-only.");
      return;
    }
    if (linkedTask && !allowsTasks(project)) {
      setMessage("This item does not have tasks.");
      return;
    }

    const completedAt = completeLinkedTask ? nowIso() : null;
    const payload = {
      user_id: userId,
      project_id: project.id,
      task_id: linkedTask?.id ?? null,
      note,
      occurred_at: occurredAt,
      created_at: nowIso(),
    };
    const newestCheckIn =
      new Date(occurredAt).getTime() > new Date(project.last_checked_at).getTime()
        ? occurredAt
        : project.last_checked_at;

    if (isRemote && supabase) {
      const { data, error } = await supabase.from("check_ins").insert(payload).select("*").single();
      if (error || !data) {
        setMessage(error?.message ?? "Could not check in.");
        return;
      }
      const projectResult = await supabase
        .from("projects")
        .update({ last_checked_at: newestCheckIn, updated_at: nowIso() })
        .eq("id", project.id);
      if (projectResult.error) {
        setMessage(projectResult.error.message);
        return;
      }
      if (linkedTask && completeLinkedTask) {
        const taskResult = await supabase
          .from("tasks")
          .update({ status: "done", completed_at: completedAt, updated_at: nowIso() })
          .eq("id", linkedTask.id);
        if (taskResult.error) {
          setMessage(taskResult.error.message);
          return;
        }
      }
      setWorkspace((current) => ({
        projects: current.projects.map((entry) =>
          entry.id === project.id
            ? { ...entry, last_checked_at: newestCheckIn, updated_at: nowIso() }
            : entry
        ),
        tasks:
          linkedTask && completeLinkedTask
            ? current.tasks.map((task) =>
                task.id === linkedTask.id
                  ? { ...task, status: "done", completed_at: completedAt, updated_at: nowIso() }
                  : task
              )
            : current.tasks,
        checkIns: [data as CheckIn, ...current.checkIns],
      }));
    } else {
      setWorkspace((current) => ({
        projects: current.projects.map((entry) =>
          entry.id === project.id
            ? { ...entry, last_checked_at: newestCheckIn, updated_at: nowIso() }
            : entry
        ),
        tasks:
          linkedTask && completeLinkedTask
            ? current.tasks.map((task) =>
                task.id === linkedTask.id
                  ? { ...task, status: "done", completed_at: completedAt, updated_at: nowIso() }
                  : task
              )
            : current.tasks,
        checkIns: [{ id: localId("checkin"), ...payload }, ...current.checkIns],
      }));
    }

    setMessage(linkedTask ? "Task completed and check-in logged." : "Check-in logged.");
  }

  async function togglePause(project: Project) {
    if (!allowsCheckIns(project)) {
      setMessage("Task-only items do not have a check-in timer.");
      return;
    }

    if (project.paused_at) {
      const pausedMs = Date.now() - new Date(project.paused_at).getTime();
      const shiftedLastCheckedAt = new Date(
        new Date(project.last_checked_at).getTime() + pausedMs
      ).toISOString();
      await patchProject(project, { paused_at: null, last_checked_at: shiftedLastCheckedAt });
      return;
    }

    await patchProject(project, { paused_at: nowIso() });
  }

  async function completeProject(project: Project) {
    await patchProject(project, { completed_at: nowIso(), paused_at: null });
    setActiveTab("completed");
  }

  async function clearWorkspace() {
    confirmDanger(
      "Clear workspace?",
      "This deletes this user's projects, tasks, reminders, and check-ins.",
      actuallyClearWorkspace
    );
  }

  async function actuallyClearWorkspace() {
    if (isRemote && supabase) {
      await Promise.all([
        supabase.from("check_ins").delete().eq("user_id", userId),
        supabase.from("tasks").delete().eq("user_id", userId),
        supabase.from("reminders").delete().eq("user_id", userId),
        supabase.from("settings").delete().eq("user_id", userId),
        supabase.from("projects").delete().eq("user_id", userId),
      ]);
    } else {
      await AsyncStorage.removeItem(PREVIEW_STORAGE_KEY);
    }

    setWorkspace(createEmptyWorkspace());
    setMessage("Workspace cleared.");
  }

  async function testReminder() {
    const id = await scheduleLocalReminder(
      "Check-ins reminder test",
      "This is how mobile local reminders will feel."
    );
    setMessage(
      Platform.OS === "web"
        ? reminderHonestyText()
        : id
        ? "Reminder delivered through local notifications."
        : "Notification permission was not granted."
    );
  }

  async function deleteAccount() {
    confirmDanger(
      "Delete account?",
      "This permanently deletes your account and all synced Check-ins data. This cannot be undone.",
      actuallyDeleteAccount
    );
  }

  async function actuallyDeleteAccount() {
    if (localPreview) {
      await actuallyClearWorkspace();
      setLocalPreview(false);
      setMessage("Local preview data deleted.");
      return;
    }

    if (!supabase || !session) {
      setMessage("Sign in before deleting an account.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.functions.invoke("delete-account");
    setSyncing(false);

    if (error) {
      setMessage(error.message || "Could not delete account.");
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setWorkspace(createEmptyWorkspace());
    setMessage("Account deleted.");
  }

  async function openExternalUrl(url: string) {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      setMessage(`Could not open ${url}`);
      return;
    }

    await Linking.openURL(url);
  }

  function confirmDanger(title: string, body: string, onConfirm: () => void | Promise<void>) {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`${title}\n\n${body}`)) {
        void onConfirm();
      }
      return;
    }

    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Continue", style: "destructive", onPress: () => void onConfirm() },
    ]);
  }

  if (booting) {
    return (
      <CenteredScreen>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.muted}>Starting Check-ins...</Text>
      </CenteredScreen>
    );
  }

  if (!isSupabaseConfigured && !localPreview) {
    return (
      <CenteredScreen>
        <StatusBar style="dark" />
        <View style={styles.setupCard}>
          <Text style={styles.logo}>Check-ins</Text>
          <Text style={styles.h1}>Accounts need Supabase env vars.</Text>
          <Text style={styles.body}>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from
            .env.example to enable real accounts and sync.
          </Text>
          <Text style={styles.promise}>No payments. No ads. Ever.</Text>
          {allowLocalPreview ? (
            <Button label="Use local preview" onPress={() => setLocalPreview(true)} />
          ) : (
            <Text style={styles.warning}>
              Production builds require Supabase env vars. Local preview is disabled.
            </Text>
          )}
        </View>
      </CenteredScreen>
    );
  }

  if (isSupabaseConfigured && !session && !localPreview) {
    return (
      <CenteredScreen>
        <StatusBar style="dark" />
        <View style={styles.setupCard}>
          <Text style={styles.logo}>Check-ins</Text>
          <Text style={styles.h1}>{authMode === "signin" ? "Sign in" : "Create account"}</Text>
          <TextInput
            value={authEmail}
            onChangeText={setAuthEmail}
            autoCapitalize="none"
            inputMode="email"
            placeholder="Email"
            style={styles.input}
          />
          <TextInput
            value={authPassword}
            onChangeText={setAuthPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
          />
          {message ? <Text style={styles.warning}>{message}</Text> : null}
          <Button
            label={syncing ? "Working..." : authMode === "signin" ? "Sign in" : "Create account"}
            onPress={handleAuth}
            disabled={syncing}
          />
          <Button label="Send magic link" kind="secondary" onPress={sendMagicLink} />
          <Pressable
            onPress={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>
              {authMode === "signin" ? "Need an account?" : "Already have an account?"}
            </Text>
          </Pressable>
          {allowLocalPreview ? (
            <Button label="Use local preview" kind="ghost" onPress={() => setLocalPreview(true)} />
          ) : null}
        </View>
      </CenteredScreen>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>Check-ins</Text>
            <Text style={styles.subtitle}>To-dos with memory for long-term work.</Text>
          </View>
          <View style={styles.accountBadge}>
            <Text style={styles.accountText}>{localPreview ? "Local preview" : "Synced account"}</Text>
          </View>
        </View>

        <View style={styles.promiseBar}>
          <Text style={styles.promise}>No payments. No ads. Ever.</Text>
          {syncing ? <Text style={styles.syncText}>Syncing...</Text> : null}
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.metrics}>
          <Metric label="Active" value={stats.active} />
          <Metric label="Due" value={stats.due} tone="due" />
          <Metric label="Over max" value={stats.overMax} tone="danger" />
          <Metric label="Tasks" value={stats.tasks} />
          <Metric label="Check-ins" value={stats.checkIns} />
        </View>

        <View style={styles.tabs}>
          {(["today", "projects", "completed", "settings"] as Tab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "today"
                  ? "Today"
                  : tab === "projects"
                  ? "Items"
                  : tab === "completed"
                  ? "Done"
                  : "Settings"}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === "today" ? (
          <Section title="Today">
            {todayProjects.length === 0 ? (
              <EmptyText text="Nothing needs attention yet. Add a next action or check in when you touch an item." />
            ) : (
              todayProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  tasks={workspace.tasks.filter((task) => task.project_id === project.id)}
                  checkIns={workspace.checkIns.filter((entry) => entry.project_id === project.id)}
                  newTaskTitle={newTaskTitles[project.id] ?? ""}
                  setNewTaskTitle={(title) =>
                    setNewTaskTitles((current) => ({ ...current, [project.id]: title }))
                  }
                  onAddTask={() => addTask(project)}
                  onToggleTask={toggleTask}
                  onTaskCheckIn={(task) =>
                    createCheckIn(project, nowIso(), "Task completed", task, true)
                  }
                  onCheckIn={() => createCheckIn(project)}
                  onRetroCheckIn={() =>
                    createCheckIn(project, daysAgoIso(1), "Retroactive check-in")
                  }
                  onPause={() => togglePause(project)}
                  onComplete={() => completeProject(project)}
                />
              ))
            )}
          </Section>
        ) : null}

        {activeTab === "projects" ? (
          <>
            <Section title="Add item">
              <ProjectForm draft={projectDraft} setDraft={setProjectDraft} onSubmit={addProject} />
            </Section>
            <Section title="Active items">
              {activeProjects.length === 0 ? (
                <EmptyText text="Add an item to start tracking work and next actions." />
              ) : (
                activeProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    tasks={workspace.tasks.filter((task) => task.project_id === project.id)}
                    checkIns={workspace.checkIns.filter((entry) => entry.project_id === project.id)}
                    newTaskTitle={newTaskTitles[project.id] ?? ""}
                    setNewTaskTitle={(title) =>
                      setNewTaskTitles((current) => ({ ...current, [project.id]: title }))
                    }
                    onAddTask={() => addTask(project)}
                    onToggleTask={toggleTask}
                    onTaskCheckIn={(task) =>
                      createCheckIn(project, nowIso(), "Task completed", task, true)
                    }
                    onCheckIn={() => createCheckIn(project)}
                    onRetroCheckIn={() =>
                      createCheckIn(project, daysAgoIso(1), "Retroactive check-in")
                    }
                    onPause={() => togglePause(project)}
                    onComplete={() => completeProject(project)}
                  />
                ))
              )}
            </Section>
          </>
        ) : null}

        {activeTab === "completed" ? (
          <Section title="Completed">
            {completedProjects.length === 0 ? (
              <EmptyText text="Completed items will appear here with their check-in history preserved." />
            ) : (
              completedProjects.map((project) => (
                <View key={project.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{project.title}</Text>
                  <Text style={styles.muted}>Completed {formatDateTime(project.completed_at)}</Text>
                  <Text style={styles.body}>
                    {workspace.checkIns.filter((entry) => entry.project_id === project.id).length}{" "}
                    check-ins recorded
                  </Text>
                </View>
              ))
            )}
          </Section>
        ) : null}

        {activeTab === "settings" ? (
          <Section title="Settings">
            <Text style={styles.body}>{reminderHonestyText()}</Text>
            <Button label="Test local reminder" onPress={testReminder} />
            <View style={styles.divider} />
            <Text style={styles.body}>
              Data is {localPreview ? "stored on this device for preview" : "owned by the signed-in user in Supabase"}.
            </Text>
            <Button
              label="Privacy Policy"
              kind="secondary"
              onPress={() => void openExternalUrl(privacyPolicyUrl)}
            />
            <Button label="Support" kind="secondary" onPress={() => void openExternalUrl(supportUrl)} />
            <Button label="Refresh sync" kind="secondary" onPress={loadRemoteWorkspace} disabled={!isRemote} />
            <Button label="Clear workspace data" kind="danger" onPress={clearWorkspace} />
            <Button label="Delete account" kind="danger" onPress={deleteAccount} />
            <Button label={localPreview ? "Exit preview" : "Sign out"} kind="ghost" onPress={signOut} />
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ProjectForm({
  draft,
  setDraft,
  onSubmit,
}: {
  draft: ProjectDraft;
  setDraft: (draft: ProjectDraft) => void;
  onSubmit: () => void;
}) {
  const canTrackTasks = allowsTasks(draft.trackingMode);
  const canTrackCheckIns = allowsCheckIns(draft.trackingMode);

  return (
    <View style={styles.formGrid}>
      <TextInput
        value={draft.title}
        onChangeText={(title) => setDraft({ ...draft, title })}
        placeholder="Item name"
        style={styles.input}
      />
      <TrackingModeToggle
        value={draft.trackingMode}
        onChange={(trackingMode) => setDraft({ ...draft, trackingMode })}
      />
      {canTrackTasks ? (
        <TextInput
          value={draft.nextAction}
          onChangeText={(nextAction) => setDraft({ ...draft, nextAction })}
          placeholder="Next action"
          style={styles.input}
        />
      ) : null}
      <TextInput
        value={draft.notes}
        onChangeText={(notes) => setDraft({ ...draft, notes })}
        placeholder="Notes"
        multiline
        style={[styles.input, styles.textArea]}
      />
      {canTrackCheckIns ? (
        <>
          <View style={styles.inline}>
            <NumberInput
              label="Target"
              value={draft.targetAmount}
              onChange={(targetAmount) => setDraft({ ...draft, targetAmount })}
            />
            <UnitToggle
              value={draft.targetUnit}
              onChange={(targetUnit) => setDraft({ ...draft, targetUnit })}
            />
          </View>
          <View style={styles.inline}>
            <NumberInput
              label="Max"
              value={draft.maxAmount}
              onChange={(maxAmount) => setDraft({ ...draft, maxAmount })}
              disabled={!draft.maxEnabled}
            />
            <UnitToggle
              value={draft.maxUnit}
              onChange={(maxUnit) => setDraft({ ...draft, maxUnit })}
              disabled={!draft.maxEnabled}
            />
          </View>
          <Pressable
            onPress={() => setDraft({ ...draft, maxEnabled: !draft.maxEnabled })}
            style={styles.checkboxRow}
          >
            <View style={[styles.checkbox, draft.maxEnabled && styles.checkboxActive]} />
            <Text style={styles.body}>Use max gap</Text>
          </Pressable>
        </>
      ) : null}
      <Button label="Add item" onPress={onSubmit} />
    </View>
  );
}

function ProjectCard({
  project,
  tasks,
  checkIns,
  newTaskTitle,
  setNewTaskTitle,
  onAddTask,
  onToggleTask,
  onTaskCheckIn,
  onCheckIn,
  onRetroCheckIn,
  onPause,
  onComplete,
}: {
  project: Project;
  tasks: Task[];
  checkIns: CheckIn[];
  newTaskTitle: string;
  setNewTaskTitle: (title: string) => void;
  onAddTask: () => void;
  onToggleTask: (task: Task) => void;
  onTaskCheckIn: (task: Task) => void;
  onCheckIn: () => void;
  onRetroCheckIn: () => void;
  onPause: () => void;
  onComplete: () => void;
}) {
  const computed = getProjectStatus(project);
  const mode = getTrackingMode(project);
  const hasTasks = allowsTasks(mode);
  const hasCheckIns = allowsCheckIns(mode);
  const modeLabel =
    mode === "both" ? "To-do + check-in" : mode === "todo" ? "To-do item" : "Check-in item";
  const visibleTasks = hasTasks ? tasks : [];
  const visibleCheckIns = hasCheckIns ? checkIns : [];
  const openTasks = visibleTasks.filter((task) => task.status === "open");
  const completedTasks = visibleTasks.filter((task) => task.status === "done");
  const subtitle = hasCheckIns
    ? `${modeLabel} - ${formatDuration(computed.elapsedMs)} since last touch`
    : `${modeLabel} - ${openTasks.length} open task(s)`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{project.title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
        <StatusPill label={computed.label} tone={computed.tone} />
      </View>

      {hasCheckIns ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${computed.progress * 100}%` }]} />
          </View>
          <Text style={styles.body}>{computed.targetText}</Text>
          <Text style={styles.muted}>{computed.maxText}</Text>
        </>
      ) : null}

      {hasTasks && project.next_action ? (
        <View style={styles.nextAction}>
          <Text style={styles.kicker}>Next action</Text>
          <Text style={styles.nextActionText}>{project.next_action}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {hasCheckIns ? (
          <>
            <Button
              label={computed.canCheckIn ? "Check in" : computed.cooldownText ?? "Check in"}
              onPress={onCheckIn}
              disabled={!computed.canCheckIn || Boolean(project.paused_at)}
            />
            <Button label="Yesterday" kind="secondary" onPress={onRetroCheckIn} />
            <Button
              label={project.paused_at ? "Resume" : "Pause"}
              kind="secondary"
              onPress={onPause}
            />
          </>
        ) : null}
        <Button label="Complete" kind="ghost" onPress={onComplete} />
      </View>

      {hasTasks ? (
        <View style={styles.taskBlock}>
          <Text style={styles.kicker}>Tasks</Text>
          {openTasks.length === 0 ? <Text style={styles.muted}>No open tasks.</Text> : null}
          {openTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              canCheckInTask={hasCheckIns}
              onToggle={() => onToggleTask(task)}
              onCheckIn={() => onTaskCheckIn(task)}
            />
          ))}
          {completedTasks.length > 0 ? (
            <Text style={styles.muted}>{completedTasks.length} completed task(s)</Text>
          ) : null}
          <View style={styles.inlineTask}>
            <TextInput
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder="Add a task"
              style={[styles.input, styles.taskInput]}
            />
            <Button label="Add" kind="secondary" onPress={onAddTask} />
          </View>
        </View>
      ) : null}

      {hasCheckIns ? (
        <View style={styles.logbook}>
          <Text style={styles.kicker}>Logbook</Text>
          {visibleCheckIns.length === 0 ? (
            <Text style={styles.muted}>No check-ins yet.</Text>
          ) : (
            visibleCheckIns.slice(0, 3).map((entry) => {
              const linkedTask = tasks.find((task) => task.id === entry.task_id);
              return (
                <Text key={entry.id} style={styles.muted}>
                  {formatDateTime(entry.occurred_at)} - {entry.note ?? "Check-in"}
                  {linkedTask ? ` (${linkedTask.title})` : ""}
                </Text>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

function TaskRow({
  task,
  canCheckInTask,
  onToggle,
  onCheckIn,
}: {
  task: Task;
  canCheckInTask: boolean;
  onToggle: () => void;
  onCheckIn: () => void;
}) {
  return (
    <View style={styles.taskRow}>
      <Pressable onPress={onToggle} style={styles.taskToggle}>
        <View style={[styles.checkbox, task.status === "done" && styles.checkboxActive]} />
        <Text style={[styles.taskText, task.status === "done" && styles.taskTextDone]}>
          {task.title}
        </Text>
      </Pressable>
      {canCheckInTask && task.status === "open" ? (
        <Pressable onPress={onCheckIn} style={styles.taskCheckInButton}>
          <Text style={styles.taskCheckInText}>Done + check-in</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Metric({
  label,
  value,
  tone = "fresh",
}: {
  label: string;
  value: number;
  tone?: "fresh" | "due" | "danger";
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, tone === "due" && styles.dueText, tone === "danger" && styles.dangerText]}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "todo" | "fresh" | "soon" | "due" | "danger" | "paused" | "completed";
}) {
  return (
    <View
      style={[
        styles.pill,
        tone === "todo" && styles.pillTodo,
        tone === "due" && styles.pillDue,
        tone === "danger" && styles.pillDanger,
        tone === "paused" && styles.pillPaused,
        tone === "completed" && styles.pillComplete,
      ]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function TrackingModeToggle({
  value,
  onChange,
}: {
  value: TrackingMode;
  onChange: (value: TrackingMode) => void;
}) {
  const options: { value: TrackingMode; label: string }[] = [
    { value: "todo", label: "To-do" },
    { value: "checkin", label: "Check-in" },
    { value: "both", label: "Both" },
  ];

  return (
    <View style={styles.modeGroup}>
      <Text style={styles.kicker}>Item type</Text>
      <View style={styles.modeToggle}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.modeButton, value === option.value && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, value === option.value && styles.modeTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NumberInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.numberInput}>
      <Text style={styles.kicker}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        inputMode="numeric"
        style={[styles.input, disabled && styles.inputDisabled]}
      />
    </View>
  );
}

function UnitToggle({
  value,
  disabled,
  onChange,
}: {
  value: DurationUnit;
  disabled?: boolean;
  onChange: (value: DurationUnit) => void;
}) {
  return (
    <View style={[styles.unitToggle, disabled && styles.disabled]}>
      {(["days", "weeks"] as DurationUnit[]).map((unit) => (
        <Pressable
          key={unit}
          disabled={disabled}
          onPress={() => onChange(unit)}
          style={[styles.unitButton, value === unit && styles.unitButtonActive]}
        >
          <Text style={[styles.unitText, value === unit && styles.unitTextActive]}>{unit}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Button({
  label,
  kind = "primary",
  disabled = false,
  onPress,
}: {
  label: string;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        kind === "secondary" && styles.buttonSecondary,
        kind === "ghost" && styles.buttonGhost,
        kind === "danger" && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          (kind === "secondary" || kind === "ghost") && styles.buttonTextSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyText({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

function CenteredScreen({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fafaf9",
  },
  scroll: {
    alignSelf: "center",
    maxWidth: 1060,
    padding: 18,
    paddingBottom: 48,
    width: "100%",
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#fafaf9",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  setupCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    maxWidth: 480,
    padding: 20,
    width: "100%",
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  logo: {
    color: "#0c0a09",
    fontSize: 30,
    fontWeight: "800",
  },
  h1: {
    color: "#0c0a09",
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: "#57534e",
    fontSize: 15,
    marginTop: 4,
  },
  accountBadge: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  accountText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700",
  },
  promiseBar: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 12,
  },
  promise: {
    color: "#064e3b",
    fontSize: 14,
    fontWeight: "800",
  },
  syncText: {
    color: "#78716c",
    fontSize: 12,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  metric: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 112,
    padding: 12,
  },
  metricValue: {
    color: "#064e3b",
    fontSize: 24,
    fontWeight: "800",
  },
  metricLabel: {
    color: "#78716c",
    fontSize: 12,
    marginTop: 2,
  },
  dueText: {
    color: "#b45309",
  },
  dangerText: {
    color: "#b91c1c",
  },
  tabs: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
    padding: 6,
  },
  tab: {
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  tabActive: {
    backgroundColor: "#0c0a09",
  },
  tabText: {
    color: "#57534e",
    fontSize: 14,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  section: {
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#0c0a09",
    fontSize: 18,
    fontWeight: "800",
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    color: "#0c0a09",
    fontSize: 19,
    fontWeight: "800",
  },
  progressTrack: {
    backgroundColor: "#e7e5e4",
    borderRadius: 999,
    height: 9,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "#10b981",
    height: "100%",
  },
  nextAction: {
    backgroundColor: "#f5f5f4",
    borderRadius: 14,
    padding: 12,
  },
  nextActionText: {
    color: "#0c0a09",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  taskBlock: {
    borderColor: "#e7e5e4",
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  taskRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  taskToggle: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 34,
  },
  taskText: {
    color: "#292524",
    flex: 1,
    fontSize: 14,
  },
  taskTextDone: {
    color: "#a8a29e",
    textDecorationLine: "line-through",
  },
  taskCheckInButton: {
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  taskCheckInText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800",
  },
  inlineTask: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  taskInput: {
    flex: 1,
  },
  logbook: {
    gap: 4,
  },
  pill: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillTodo: {
    backgroundColor: "#f5f5f4",
    borderColor: "#d6d3d1",
  },
  pillDue: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  pillDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  pillPaused: {
    backgroundColor: "#f5f5f4",
    borderColor: "#d6d3d1",
  },
  pillComplete: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  pillText: {
    color: "#292524",
    fontSize: 12,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  formGrid: {
    gap: 10,
  },
  modeGroup: {
    gap: 6,
  },
  modeToggle: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d6d3d1",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  modeButtonActive: {
    backgroundColor: "#0c0a09",
    borderColor: "#0c0a09",
  },
  modeText: {
    color: "#57534e",
    fontSize: 13,
    fontWeight: "800",
  },
  modeTextActive: {
    color: "#ffffff",
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d6d3d1",
    borderRadius: 14,
    borderWidth: 1,
    color: "#0c0a09",
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputDisabled: {
    backgroundColor: "#f5f5f4",
    color: "#a8a29e",
  },
  textArea: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  inline: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
  },
  numberInput: {
    flex: 1,
    gap: 4,
  },
  unitToggle: {
    borderColor: "#d6d3d1",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  disabled: {
    opacity: 0.5,
  },
  unitButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  unitButtonActive: {
    backgroundColor: "#0c0a09",
  },
  unitText: {
    color: "#57534e",
    fontSize: 13,
    fontWeight: "700",
  },
  unitTextActive: {
    color: "#ffffff",
  },
  checkboxRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  checkbox: {
    borderColor: "#a8a29e",
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    width: 18,
  },
  checkboxActive: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#0c0a09",
    borderColor: "#0c0a09",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderColor: "#d6d3d1",
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderColor: "#e7e5e4",
  },
  buttonDanger: {
    backgroundColor: "#b91c1c",
    borderColor: "#b91c1c",
  },
  buttonDisabled: {
    backgroundColor: "#d6d3d1",
    borderColor: "#d6d3d1",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  buttonTextSecondary: {
    color: "#292524",
  },
  body: {
    color: "#44403c",
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: "#78716c",
    fontSize: 13,
  },
  kicker: {
    color: "#78716c",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  empty: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 16,
    borderWidth: 1,
    color: "#78716c",
    fontSize: 14,
    padding: 16,
    textAlign: "center",
  },
  message: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 14,
    borderWidth: 1,
    color: "#92400e",
    marginBottom: 12,
    padding: 12,
  },
  warning: {
    color: "#b45309",
    fontSize: 13,
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 4,
  },
  linkText: {
    color: "#57534e",
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  divider: {
    backgroundColor: "#e7e5e4",
    height: 1,
  },
});
