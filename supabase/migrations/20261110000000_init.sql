-- 簡易活動登記：資料表與報名函式
-- 所有存取都經過 Edge Function（service role），前端 anon key 無法直接讀寫。

create table if not exists public.events (
  id             text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  owner_id       text not null,
  owner_name     text,
  title          text not null check (char_length(title) between 1 and 60),
  date           date not null,
  time           text,
  location       text check (char_length(location) <= 100),
  description    text check (char_length(description) <= 2000),
  capacity       int  not null default 0 check (capacity >= 0),
  max_per_person int  not null default 1 check (max_per_person between 1 and 20),
  deadline       date,
  ask_phone      boolean not null default true,
  status         text not null default 'open' check (status in ('open', 'closed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists events_owner_idx on public.events (owner_id);

create table if not exists public.registrations (
  id           bigint generated always as identity primary key,
  event_id     text not null references public.events (id) on delete cascade,
  user_id      text not null,
  display_name text,
  name         text not null check (char_length(name) between 1 and 30),
  phone        text check (char_length(phone) <= 20),
  count        int  not null default 1 check (count >= 1),
  note         text check (char_length(note) <= 100),
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- 每人每活動只能有一筆有效報名
create unique index if not exists registrations_one_active
  on public.registrations (event_id, user_id) where status = 'active';
create index if not exists registrations_user_idx on public.registrations (user_id) where status = 'active';

alter table public.events        enable row level security;
alter table public.registrations enable row level security;
-- 不建立任何 policy：anon / authenticated 角色完全無法存取，只有 service role（Edge Function）可以。

-- 報名／修改報名：鎖住活動列，避免同時報名超賣名額
create or replace function public.register_event(
  p_event_id text, p_user_id text, p_display_name text,
  p_name text, p_phone text, p_count int, p_note text
) returns void
language plpgsql
set search_path = public
as $$
declare
  ev      public.events;
  v_count int;
  v_taken int;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found then raise exception '找不到活動'; end if;

  if ev.status = 'closed'
     or (ev.deadline is not null and now() >= ((ev.deadline + 1)::timestamp at time zone 'Asia/Taipei')) then
    raise exception '報名已截止';
  end if;

  if coalesce(btrim(p_name), '') = '' then raise exception '請填寫姓名'; end if;
  if ev.ask_phone and coalesce(btrim(p_phone), '') = '' then raise exception '請填寫電話'; end if;

  v_count := least(greatest(coalesce(p_count, 1), 1), ev.max_per_person);

  select coalesce(sum(count), 0) into v_taken
    from public.registrations
   where event_id = p_event_id and status = 'active' and user_id <> p_user_id;

  if ev.capacity > 0 and v_taken + v_count > ev.capacity then
    raise exception '名額不足';
  end if;

  update public.registrations
     set name = left(btrim(p_name), 30), phone = left(coalesce(btrim(p_phone), ''), 20),
         count = v_count, note = left(coalesce(p_note, ''), 100), updated_at = now()
   where event_id = p_event_id and user_id = p_user_id and status = 'active';

  if not found then
    insert into public.registrations (event_id, user_id, display_name, name, phone, count, note)
    values (p_event_id, p_user_id, p_display_name, left(btrim(p_name), 30),
            left(coalesce(btrim(p_phone), ''), 20), v_count, left(coalesce(p_note, ''), 100));
  end if;
end;
$$;

revoke all on function public.register_event(text, text, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.register_event(text, text, text, text, text, int, text) to service_role;
