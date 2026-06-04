alter table public.projects
add column if not exists tracking_mode text not null default 'both';

alter table public.projects
drop constraint if exists projects_tracking_mode_check;

alter table public.projects
add constraint projects_tracking_mode_check
check (tracking_mode in ('todo', 'checkin', 'both'));

create index if not exists projects_user_tracking_mode_idx on public.projects(user_id, tracking_mode);
