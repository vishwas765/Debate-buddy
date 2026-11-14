-- Debate Buddy: database tables and security rules.
-- How to use: Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
-- It is safe to run more than once.
--
-- Every table has Row Level Security turned on. The app only ever uses the publishable
-- (anon) key plus the signed-in person's own session, so these rules decide who sees what:
--   profiles         each person can read only their own row (it holds their role)
--   debate_sessions  each person can read and change only their own sessions
--   user_settings    each person can read and change only their own settings (looks, colours, defaults)
--   shared_topics    any signed-in person can read; only teachers can add, edit or remove
-- People who are not signed in can read and change nothing.

-- ---------- profiles: one row per account, with a role ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
-- No insert, update or delete policy on purpose: nobody can change their own role from the
-- app. A profile row is created automatically at sign-up (below), and a teacher is made by
-- the project owner in the dashboard (see the end of this file).

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that already existed before this file was run.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

create or replace function public.is_teacher() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'teacher');
$$;

-- ---------- debate_sessions: practice sessions and research briefs, per person ----------
create table if not exists public.debate_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  type text not null check (type in ('practice', 'research')),
  topic text not null default '',
  format text not null default '',
  status text not null default '',
  updated_at bigint not null,          -- time of the last change, in milliseconds
  deleted boolean not null default false, -- true = deleted by its owner; kept so other devices remove it too
  data jsonb,                          -- the full session as the app saves it
  primary key (user_id, id)
);
alter table public.debate_sessions enable row level security;

drop policy if exists "sessions: read own" on public.debate_sessions;
create policy "sessions: read own" on public.debate_sessions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "sessions: add own" on public.debate_sessions;
create policy "sessions: add own" on public.debate_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "sessions: change own" on public.debate_sessions;
create policy "sessions: change own" on public.debate_sessions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "sessions: delete own" on public.debate_sessions;
create policy "sessions: delete own" on public.debate_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- user_settings: one row per person with their looks and preferences ----------
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  updated_at bigint not null,
  data jsonb not null default '{}'
);
alter table public.user_settings enable row level security;

drop policy if exists "settings: read own" on public.user_settings;
create policy "settings: read own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "settings: add own" on public.user_settings;
create policy "settings: add own" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "settings: change own" on public.user_settings;
create policy "settings: change own" on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "settings: delete own" on public.user_settings;
create policy "settings: delete own" on public.user_settings
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- shared_topics: the list teachers publish for everyone ----------
create table if not exists public.shared_topics (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 3 and 300),
  category text not null,
  formats text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shared_topics enable row level security;

drop policy if exists "topics: read when signed in" on public.shared_topics;
create policy "topics: read when signed in" on public.shared_topics
  for select to authenticated using (true);
drop policy if exists "topics: teachers add" on public.shared_topics;
create policy "topics: teachers add" on public.shared_topics
  for insert to authenticated with check ((select public.is_teacher()) and created_by = (select auth.uid()));
drop policy if exists "topics: teachers change" on public.shared_topics;
create policy "topics: teachers change" on public.shared_topics
  for update to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));
drop policy if exists "topics: teachers remove" on public.shared_topics;
create policy "topics: teachers remove" on public.shared_topics
  for delete to authenticated using ((select public.is_teacher()));

-- ---------- permissions: signed-in people only, and only through the rules above ----------
revoke all on public.profiles, public.debate_sessions, public.user_settings, public.shared_topics from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.debate_sessions to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.shared_topics to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

-- ---------- making someone a teacher ----------
-- Run this separately, after that person has created their account in the app.
-- Replace the email address first.
--
--   update public.profiles set role = 'teacher'
--   where id = (select id from auth.users where email = 'teacher@example.com');
