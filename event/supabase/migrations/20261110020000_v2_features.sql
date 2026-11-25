-- v2：開始/結束時間、圖卡色調、圖片、按鈕文字、地圖連結、自訂問題、活動前提醒、個人資料
-- 可重複執行（if not exists / or replace）

alter table public.events
  add column if not exists start_at       timestamptz,
  add column if not exists end_at         timestamptz,
  add column if not exists deadline_at    timestamptz,
  add column if not exists theme          text   not null default 'classic',
  add column if not exists image_url      text,
  add column if not exists button_text    text   not null default '我要登記',
  add column if not exists map_url        text,
  add column if not exists questions      jsonb  not null default '[]'::jsonb,
  add column if not exists reminders      text[] not null default '{}',
  add column if not exists reminders_sent text[] not null default '{}';

alter table public.events alter column date drop not null;

-- 舊資料轉換（date/time/deadline → start_at/deadline_at）
update public.events
   set start_at = (date + coalesce(nullif(time, ''), '00:00')::time) at time zone 'Asia/Taipei'
 where start_at is null and date is not null;
update public.events
   set deadline_at = (deadline + 1)::timestamp at time zone 'Asia/Taipei'
 where deadline_at is null and deadline is not null;

create index if not exists events_reminder_idx on public.events (start_at) where cardinality(reminders) > 0;

alter table public.registrations add column if not exists answers jsonb not null default '{}'::jsonb;

-- 個人資料：報名時自動帶入
create table if not exists public.profiles (
  user_id    text primary key,
  name       text,
  phone      text,
  answers    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 報名函式（新增 answers、改用 deadline_at）
drop function if exists public.register_event(text, text, text, text, text, int, text);
create or replace function public.register_event(
  p_event_id text, p_user_id text, p_display_name text,
  p_name text, p_phone text, p_count int, p_note text, p_answers jsonb
) returns void
language plpgsql
set search_path = public
as $$
declare
  ev      public.events;
  v_count int;
  v_taken int;
  v_deadline timestamptz;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found then raise exception '找不到活動'; end if;

  v_deadline := coalesce(ev.deadline_at, (ev.deadline + 1)::timestamp at time zone 'Asia/Taipei');
  if ev.status = 'closed' or (v_deadline is not null and now() >= v_deadline) then
    raise exception '登記已截止';
  end if;

  if coalesce(btrim(p_name), '') = '' then raise exception '請填寫姓名'; end if;
  if ev.ask_phone and coalesce(btrim(p_phone), '') = '' then raise exception '請填寫電話'; end if;

  v_count := least(greatest(coalesce(p_count, 1), 1), ev.max_per_person);

  select coalesce(sum(count), 0) into v_taken
    from public.registrations
   where event_id = p_event_id and status = 'active' and user_id <> p_user_id;

  if ev.capacity > 0 and v_taken + v_count > ev.capacity then
    raise exception '名額不足（剩 % 位）', greatest(ev.capacity - v_taken, 0);
  end if;

  update public.registrations
     set name = left(btrim(p_name), 30), phone = left(coalesce(btrim(p_phone), ''), 20),
         count = v_count, note = left(coalesce(p_note, ''), 100),
         answers = coalesce(p_answers, '{}'::jsonb), updated_at = now()
   where event_id = p_event_id and user_id = p_user_id and status = 'active';

  if not found then
    insert into public.registrations (event_id, user_id, display_name, name, phone, count, note, answers)
    values (p_event_id, p_user_id, p_display_name, left(btrim(p_name), 30),
            left(coalesce(btrim(p_phone), ''), 20), v_count, left(coalesce(p_note, ''), 100),
            coalesce(p_answers, '{}'::jsonb));
  end if;
end;
$$;

revoke all on function public.register_event(text, text, text, text, text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.register_event(text, text, text, text, text, int, text, jsonb) to service_role;

-- 活動圖片的公開儲存空間（Supabase Storage）
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('event-images', 'event-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
