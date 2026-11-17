-- 小排福音代禱牆
create table if not exists public.prayer_entries (
  id           bigint generated always as identity primary key,
  wall         text not null default 'main',
  group_name   text not null check (char_length(group_name) between 1 and 30),
  name         text not null check (char_length(name) between 1 and 20),
  user_id      text not null,
  display_name text,
  created_at   timestamptz not null default now(),
  constraint prayer_entries_unique unique (wall, group_name, name)
);
create index if not exists prayer_entries_wall_idx on public.prayer_entries (wall, created_at);
alter table public.prayer_entries enable row level security;
-- 不建立 policy：只有 Edge Function（service role）可以讀寫
