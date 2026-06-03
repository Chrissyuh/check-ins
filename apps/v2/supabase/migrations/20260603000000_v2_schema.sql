create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  next_action text,
  target_amount integer not null default 2 check (target_amount > 0),
  target_unit text not null default 'days' check (target_unit in ('days', 'weeks')),
  max_enabled boolean not null default true,
  max_amount integer check (max_amount is null or max_amount > 0),
  max_unit text check (max_unit is null or max_unit in ('days', 'weeks')),
  last_checked_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_at timestamptz,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  remind_when text not null default 'target' check (remind_when in ('target', 'max')),
  local_notification_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, remind_when)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default false,
  default_sort text not null default 'urgency' check (default_sort in ('urgency', 'alphabetical', 'check-ins')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists tasks_user_project_idx on public.tasks(user_id, project_id);
create index if not exists check_ins_user_project_idx on public.check_ins(user_id, project_id, occurred_at desc);
create index if not exists reminders_user_project_idx on public.reminders(user_id, project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.check_ins enable row level security;
alter table public.reminders enable row level security;
alter table public.settings enable row level security;

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
for select using (auth.uid() = user_id);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
for insert with check (auth.uid() = user_id);

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
for delete using (auth.uid() = user_id);

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
for select using (auth.uid() = user_id);

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks
for insert with check (auth.uid() = user_id);

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks
for delete using (auth.uid() = user_id);

drop policy if exists check_ins_select_own on public.check_ins;
create policy check_ins_select_own on public.check_ins
for select using (auth.uid() = user_id);

drop policy if exists check_ins_insert_own on public.check_ins;
create policy check_ins_insert_own on public.check_ins
for insert with check (auth.uid() = user_id);

drop policy if exists check_ins_delete_own on public.check_ins;
create policy check_ins_delete_own on public.check_ins
for delete using (auth.uid() = user_id);

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own on public.reminders
for select using (auth.uid() = user_id);

drop policy if exists reminders_insert_own on public.reminders;
create policy reminders_insert_own on public.reminders
for insert with check (auth.uid() = user_id);

drop policy if exists reminders_update_own on public.reminders;
create policy reminders_update_own on public.reminders
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reminders_delete_own on public.reminders;
create policy reminders_delete_own on public.reminders
for delete using (auth.uid() = user_id);

drop policy if exists settings_select_own on public.settings;
create policy settings_select_own on public.settings
for select using (auth.uid() = user_id);

drop policy if exists settings_insert_own on public.settings;
create policy settings_insert_own on public.settings
for insert with check (auth.uid() = user_id);

drop policy if exists settings_update_own on public.settings;
create policy settings_update_own on public.settings
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
