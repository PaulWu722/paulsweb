-- =====================================================================
-- Group Meet（小排聚會信息）資料庫
-- 貼到 Supabase → SQL Editor → Run。可以重複執行，不會刪掉已上傳的資料。
--
-- 管理密碼預設是 1234，請立刻修改：
--   update public.gm_settings
--     set value = encode(sha256(convert_to('新密碼', 'UTF8')), 'hex')
--     where key = 'admin_password_sha256';
-- =====================================================================

-- ---------- 資料表 ----------
create table if not exists public.gm_messages (
  id         uuid primary key default gen_random_uuid(),
  meet_date  date not null,
  title      text not null,
  note       text not null default '',
  bible      jsonb not null default '[]'::jsonb,   -- 讀經進度 [{"b":43,"c1":3,"c2":4}]
  file_path  text,                                -- PDF 可留空
  file_name  text not null default '',
  file_size  bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.gm_messages add column if not exists bible jsonb not null default '[]'::jsonb;
alter table public.gm_messages alter column file_path drop not null;
create index if not exists gm_messages_date_idx on public.gm_messages (meet_date desc);

create table if not exists public.gm_settings (
  key   text primary key,
  value text not null
);

-- 上傳／刪除 PDF 的一次性許可（輸入正確密碼才會產生，30 分鐘內有效）
create table if not exists public.gm_file_tickets (
  path       text not null,
  kind       text not null check (kind in ('upload', 'delete')),
  expires_at timestamptz not null,
  primary key (path, kind)
);

-- 開啟 RLS 且不建立任何 policy：訪客無法直接讀寫資料表，只能透過下面的函式
alter table public.gm_messages     enable row level security;
alter table public.gm_settings     enable row level security;
alter table public.gm_file_tickets enable row level security;

insert into public.gm_settings (key, value)
values ('admin_password_sha256', encode(sha256(convert_to('1234', 'UTF8')), 'hex'))
on conflict (key) do nothing;

-- ---------- 檔案空間（公開讀取，只收 PDF，單檔上限 50MB） ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('groupmeet', 'groupmeet', true, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.gm_ticket_ok(p_path text, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gm_file_tickets
    where path = p_path and kind = p_kind and expires_at > now()
  );
$$;

drop policy if exists "gm read"   on storage.objects;
drop policy if exists "gm upload" on storage.objects;
drop policy if exists "gm delete" on storage.objects;
create policy "gm read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'groupmeet');
create policy "gm upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'groupmeet' and public.gm_ticket_ok(name, 'upload'));
create policy "gm delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'groupmeet' and public.gm_ticket_ok(name, 'delete'));

-- ---------- 公開：信息列表 ----------
create or replace function public.gm_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'meet_date', meet_date, 'title', title, 'note', note, 'bible', bible,
    'file_path', file_path, 'file_name', file_name, 'file_size', file_size
  ) order by meet_date desc, created_at desc), '[]'::jsonb)
  from gm_messages;
$$;

-- ---------- 管理 ----------
create or replace function public.gm_admin_check(p_pass text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from gm_settings
    where key = 'admin_password_sha256'
      and value = encode(sha256(convert_to(coalesce(p_pass, ''), 'UTF8')), 'hex')
  ) then
    raise exception '密碼錯誤';
  end if;
end $$;

create or replace function public.gm_admin_login(p_pass text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform gm_admin_check(p_pass);
  return jsonb_build_object('ok', true);
end $$;

-- 取得一個上傳位置；前端拿到後直接把 PDF 上傳到這個路徑
create or replace function public.gm_admin_ticket(p_pass text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_path text;
begin
  perform gm_admin_check(p_pass);
  delete from gm_file_tickets where expires_at < now();
  v_path := to_char(now() at time zone 'Asia/Taipei', 'YYYY') || '/' || gen_random_uuid() || '.pdf';
  insert into gm_file_tickets (path, kind, expires_at) values (v_path, 'upload', now() + interval '30 minutes');
  return jsonb_build_object('path', v_path);
end $$;

create or replace function public.gm_claim_upload(p_path text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from gm_file_tickets where path = p_path and kind = 'upload') then
    raise exception '上傳逾時，請重新上傳';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'groupmeet' and name = p_path) then
    raise exception '找不到上傳的 PDF，請重新上傳';
  end if;
  delete from gm_file_tickets where path = p_path and kind = 'upload';
end $$;

create or replace function public.gm_delete_ticket(p_path text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  insert into gm_file_tickets (path, kind, expires_at) values (p_path, 'delete', now() + interval '30 minutes')
  on conflict (path, kind) do update set expires_at = excluded.expires_at;
end $$;

create or replace function public.gm_check_bible(p_bible jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
begin
  if p_bible is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_bible) <> 'array' or jsonb_array_length(p_bible) > 20 then
    raise exception '讀經進度格式不正確';
  end if;
  return p_bible;
end $$;

drop function if exists public.gm_admin_add(text, date, text, text, text, text, bigint);
drop function if exists public.gm_admin_update(text, uuid, date, text, text);

-- 新增一週；p_path 可為 null（只有讀經進度、沒有 PDF）
create or replace function public.gm_admin_add(
  p_pass text, p_date date, p_title text, p_note text, p_bible jsonb,
  p_path text, p_file_name text, p_file_size bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform gm_admin_check(p_pass);
  if p_date is null then raise exception '請選擇聚會日期'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception '請填寫標題'; end if;
  if p_path is not null then perform gm_claim_upload(p_path); end if;
  insert into gm_messages (meet_date, title, note, bible, file_path, file_name, file_size)
  values (p_date, left(btrim(p_title), 200), left(coalesce(p_note, ''), 2000), gm_check_bible(p_bible),
          p_path, case when p_path is null then '' else left(coalesce(p_file_name, ''), 200) end,
          case when p_path is null then 0 else coalesce(p_file_size, 0) end);
  return gm_list();
end $$;

-- 修改一週；p_path 為 null = 保留原本的 PDF；有給 = 換成新的 PDF（回傳舊檔路徑讓前端刪除）
create or replace function public.gm_admin_update(
  p_pass text, p_id uuid, p_date date, p_title text, p_note text, p_bible jsonb,
  p_path text, p_file_name text, p_file_size bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_old text;
begin
  perform gm_admin_check(p_pass);
  if p_date is null then raise exception '請選擇聚會日期'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception '請填寫標題'; end if;
  select file_path into v_old from gm_messages where id = p_id for update;
  if not found then raise exception '找不到這筆信息，請重新整理'; end if;
  if p_path is not null then perform gm_claim_upload(p_path); end if;
  update gm_messages set
    meet_date = p_date, title = left(btrim(p_title), 200),
    note = left(coalesce(p_note, ''), 2000), bible = gm_check_bible(p_bible),
    file_path = coalesce(p_path, file_path),
    file_name = case when p_path is null then file_name else left(coalesce(p_file_name, ''), 200) end,
    file_size = case when p_path is null then file_size else coalesce(p_file_size, 0) end
  where id = p_id;
  if p_path is not null and v_old is not null then
    perform gm_delete_ticket(v_old);
  else
    v_old := null;
  end if;
  return jsonb_build_object('old_path', v_old, 'items', gm_list());
end $$;

-- 刪除一筆；回傳檔案路徑，前端再把 PDF 從檔案空間移除
create or replace function public.gm_admin_delete(p_pass text, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_path text;
begin
  perform gm_admin_check(p_pass);
  delete from gm_messages where id = p_id returning file_path into v_path;
  if not found then raise exception '找不到這筆信息，請重新整理'; end if;
  if v_path is not null then perform gm_delete_ticket(v_path); end if;
  return jsonb_build_object('path', v_path, 'items', gm_list());
end $$;

revoke execute on function public.gm_admin_check(text) from public, anon, authenticated;
revoke execute on function public.gm_claim_upload(text) from public, anon, authenticated;
revoke execute on function public.gm_delete_ticket(text) from public, anon, authenticated;
grant execute on function public.gm_ticket_ok(text, text) to anon, authenticated;
grant execute on function public.gm_list() to anon, authenticated;
grant execute on function public.gm_admin_login(text) to anon, authenticated;
grant execute on function public.gm_admin_ticket(text) to anon, authenticated;
grant execute on function public.gm_admin_add(text, date, text, text, jsonb, text, text, bigint) to anon, authenticated;
grant execute on function public.gm_admin_update(text, uuid, date, text, text, jsonb, text, text, bigint) to anon, authenticated;
grant execute on function public.gm_admin_delete(text, uuid) to anon, authenticated;
