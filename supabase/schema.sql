-- =====================================================================
-- 年終愛筵報名 — Supabase 資料庫
-- 用法：Supabase 後台 → SQL Editor → New query → 貼上整份 → Run
-- 可以重複執行（不會刪掉已經報名的資料）。
-- =====================================================================

-- ---------- 資料表 ----------

-- 桌子與桌長（到 Table Editor → feast_tables 直接修改桌長姓名）
create table if not exists public.feast_tables (
  no      int  primary key,
  captain text not null default ''
);

insert into public.feast_tables (no, captain)
select g, '桌長' || g from generate_series(1, 20) as g
on conflict (no) do nothing;

-- 一次報名 = 一個家庭（全家共用修改碼、坐同一桌）
create table if not exists public.feast_families (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  area       text not null,
  note       text not null default '',
  table_no   int  references public.feast_tables(no) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

-- 每一位報名者
create table if not exists public.feast_people (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.feast_families(id) on delete cascade,
  sort       int  not null default 0,
  name       text not null,
  gender     text not null check (gender in ('男', '女')),
  role       text check (role in ('聖徒', '福音朋友', '學生')),
  created_at timestamptz not null default now()
);

-- 身分選項：聖徒／福音朋友／學生（既有資料庫也會一併更新規則）
alter table public.feast_people drop constraint if exists feast_people_role_check;
alter table public.feast_people add constraint feast_people_role_check check (role in ('聖徒', '福音朋友', '學生'));

-- 由名單匯入的人可能沒有性別／身分資料（網站報名仍必填）
alter table public.feast_people alter column gender drop not null;
alter table public.feast_people alter column role drop not null;

-- 同名只能報名一次（若真有兩位同名，請在姓名後加註區分，例如「王小明（朝陽）」）
create unique index if not exists feast_people_name_uniq on public.feast_people (btrim(name));

create index if not exists feast_people_family_idx on public.feast_people (family_id);
create index if not exists feast_families_table_idx on public.feast_families (table_no);

-- 開啟 RLS 且不給任何 policy：網站訪客不能直接讀寫資料表，
-- 只能透過下面的函式操作（函式裡會檢查修改碼、名額）。
alter table public.feast_tables   enable row level security;
alter table public.feast_families enable row level security;
alter table public.feast_people   enable row level security;

-- 給同工看的完整名單（在 SQL Editor 執行 select * from feast_roster;）
-- security_invoker：訪客透過 API 讀這個 view 也只會看到空的。
create or replace view public.feast_roster with (security_invoker = true) as
select f.created_at as 報名時間, p.name as 姓名, p.gender as 性別, p.role as 身分,
       f.area as 小區, f.note as 備註, f.table_no as 桌號, t.captain as 桌長,
       f.code as 修改碼, f.id as 家庭編號
from public.feast_people p
join public.feast_families f on f.id = p.family_id
left join public.feast_tables t on t.no = f.table_no
order by f.table_no nulls last, f.created_at, p.sort;

revoke all on public.feast_roster from anon, authenticated;

-- ---------- 設定 ----------

-- 每桌人數上限（含桌長）
create or replace function public.feast_capacity() returns int
language sql immutable set search_path = '' as $$ select 10 $$;

-- ---------- 內部工具函式 ----------

-- 一桌目前人數：桌長算一位；桌長本人若也報名坐在自己這桌，不重複計算
create or replace function public.feast_count(p_table int, p_exclude_family uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from feast_people p
            join feast_families f on f.id = p.family_id
           where f.table_no = p_table
             and (p_exclude_family is null or f.id <> p_exclude_family)
             and p.name <> t.captain)::int
       + case when t.captain <> '' then 1 else 0 end
  from feast_tables t where t.no = p_table
$$;

create or replace function public.feast_party(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', f.id, 'code', f.code, 'table', coalesce(f.table_no, 0),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'gender', p.gender, 'role', p.role, 'area', f.area) order by p.sort)
      from feast_people p where p.family_id = f.id), '[]'::jsonb))
  from feast_families f where f.id = p_id
$$;

-- ---------- 網站呼叫的函式 ----------

-- 所有桌子與目前入座名單
create or replace function public.feast_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'capacity', feast_capacity(),
    'tables', coalesce(jsonb_agg(jsonb_build_object(
      'no', t.no,
      'captain', t.captain,
      'count', feast_count(t.no),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('name', p.name, 'area', f.area, 'role', p.role) order by f.created_at, p.sort)
        from feast_families f join feast_people p on p.family_id = f.id
        where f.table_no = t.no), '[]'::jsonb)
    ) order by t.no), '[]'::jsonb))
  from feast_tables t
$$;

-- 報名（可一次多位家人）
create or replace function public.feast_register(
  p_members jsonb, p_area text, p_area_other text default '', p_note text default ''
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  n int;
  m jsonb;
  i int := 0;
  v_name text;
  v_who text;
  v_area text;
  v_family uuid;
  v_dup text;
  v_code text := (1000 + floor(random() * 9000))::int::text;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise exception '請至少填寫一位報名者';
  end if;
  n := jsonb_array_length(p_members);
  if n = 0 then raise exception '請至少填寫一位報名者'; end if;
  if n > 10 then raise exception '一次最多報名 10 位'; end if;

  for m in select * from jsonb_array_elements(p_members) loop
    i := i + 1;
    v_name := left(btrim(coalesce(m->>'name', '')), 30);
    v_who := case when n > 1 then '第 ' || i || ' 位' else '' end;
    if v_name = '' then raise exception '請填寫%姓名', v_who; end if;
    if coalesce(m->>'gender', '') not in ('男', '女') then
      raise exception '請選擇%的性別', coalesce(nullif(v_who, ''), v_name);
    end if;
    if coalesce(m->>'role', '') not in ('聖徒', '福音朋友', '學生') then
      raise exception '請選擇%的身分', coalesce(nullif(v_who, ''), v_name);
    end if;
  end loop;

  if coalesce(p_area, '') not in ('霧峰', '朝陽', '其他') then
    raise exception '請選擇小區';
  end if;
  v_area := case
    when p_area = '其他' and btrim(coalesce(p_area_other, '')) <> ''
      then '其他（' || left(btrim(p_area_other), 20) || '）'
    else p_area end;

  -- 防止重複報名（同時有人送出時依序處理）
  perform pg_advisory_xact_lock(hashtext('feast_register'));

  select x.n into v_dup
  from (select left(btrim(e->>'name'), 30) as n from jsonb_array_elements(p_members) e) x
  group by x.n having count(*) > 1 limit 1;
  if v_dup is not null then
    raise exception '「%」在這次報名中填寫了兩次', v_dup;
  end if;

  select string_agg(p.name || '（' || coalesce('第 ' || f.table_no || ' 桌', '尚未安排桌次') || '）', '、' order by f.created_at)
  into v_dup
  from feast_people p join feast_families f on f.id = p.family_id
  where btrim(p.name) in (select left(btrim(e->>'name'), 30) from jsonb_array_elements(p_members) e);
  if v_dup is not null then
    raise exception '你已經報名過了：%', v_dup;
  end if;

  insert into feast_families (code, area, note)
  values (v_code, v_area, left(btrim(coalesce(p_note, '')), 200))
  returning id into v_family;

  insert into feast_people (family_id, sort, name, gender, role)
  select v_family, e.ord, left(btrim(e.val->>'name'), 30), e.val->>'gender', e.val->>'role'
  from jsonb_array_elements(p_members) with ordinality as e(val, ord);

  return jsonb_build_object('me', feast_party(v_family));
end $$;

-- 用「任一位家人的姓名＋修改碼」登入
create or replace function public.feast_login(p_name text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_family uuid;
begin
  select f.id into v_family
  from feast_people p join feast_families f on f.id = p.family_id
  where p.name = btrim(coalesce(p_name, '')) and f.code = btrim(coalesce(p_code, ''))
  order by f.created_at desc limit 1;
  if v_family is null then raise exception '姓名或修改碼不正確'; end if;
  return jsonb_build_object('me', feast_party(v_family));
end $$;

-- 讀取自己的報名資料（瀏覽器記住的編號＋修改碼）
create or replace function public.feast_me(p_id uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from feast_families where id = p_id and code = p_code) then
    raise exception '找不到報名資料，請重新登入';
  end if;
  return jsonb_build_object('me', feast_party(p_id));
end $$;

-- 選桌／換桌／離開（p_table = 0 表示離開）；全家一起移動
create or replace function public.feast_seat(p_id uuid, p_code text, p_table int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_size int;
  v_after int;
  v_left int;
  v_captain text;
begin
  if not exists (select 1 from feast_families where id = p_id and code = p_code) then
    raise exception '找不到報名資料，請重新登入';
  end if;

  if coalesce(p_table, 0) <> 0 then
    -- 鎖住這張桌子，避免兩個人同時搶最後一個位子
    select captain into v_captain from feast_tables where no = p_table for update;
    if not found then raise exception '桌號不正確'; end if;

    select count(*) into v_size from feast_people
    where family_id = p_id and name <> v_captain;

    v_after := feast_count(p_table, p_id) + v_size;
    if v_after > feast_capacity() then
      v_left := greatest(0, feast_capacity() - feast_count(p_table, p_id));
      if v_left = 0 then
        raise exception '這桌已經滿了，請選擇其他桌';
      end if;
      raise exception '這桌只剩 % 個位子，不夠 % 位入座', v_left, v_size;
    end if;
  end if;

  update feast_families set table_no = nullif(p_table, 0) where id = p_id;
  return jsonb_build_object('me', feast_party(p_id)) || feast_state();
end $$;

-- ---------- 權限：訪客只能呼叫網站用的函式 ----------
revoke execute on function public.feast_count(int, uuid) from public, anon, authenticated;
revoke execute on function public.feast_party(uuid) from public, anon, authenticated;
grant execute on function public.feast_state() to anon, authenticated;
grant execute on function public.feast_register(jsonb, text, text, text) to anon, authenticated;
grant execute on function public.feast_login(text, text) to anon, authenticated;
grant execute on function public.feast_me(uuid, text) to anon, authenticated;
grant execute on function public.feast_seat(uuid, text, int) to anon, authenticated;

-- =====================================================================
-- 同工管理頁（admin.html）：密碼保護的名單與拖曳換座
-- 修改密碼：update public.feast_settings
--   set value = encode(sha256(convert_to('新密碼', 'UTF8')), 'hex')
--   where key = 'admin_password_sha256';
-- =====================================================================

create table if not exists public.feast_settings (
  key   text primary key,
  value text not null
);
alter table public.feast_settings enable row level security;

insert into public.feast_settings (key, value)
values ('admin_password_sha256', encode(sha256(convert_to('1234', 'UTF8')), 'hex'))
on conflict (key) do nothing;

create or replace function public.feast_admin_check(p_pass text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from feast_settings
    where key = 'admin_password_sha256'
      and value = encode(sha256(convert_to(coalesce(p_pass, ''), 'UTF8')), 'hex')
  ) then
    raise exception '密碼錯誤';
  end if;
end $$;

create or replace function public.feast_admin_overview(p_pass text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform feast_admin_check(p_pass);
  return jsonb_build_object(
    'capacity', feast_capacity(),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'no', t.no, 'captain', t.captain, 'count', feast_count(t.no),
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'area', f.area, 'family', f.id) order by f.created_at, p.sort)
          from feast_families f join feast_people p on p.family_id = f.id
          where f.table_no = t.no), '[]'::jsonb)
      ) order by t.no), '[]'::jsonb)
      from feast_tables t),
    'unseated', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'area', f.area, 'family', f.id) order by f.created_at, p.sort)
      from feast_families f join feast_people p on p.family_id = f.id
      where f.table_no is null), '[]'::jsonb));
end $$;

-- 把一個人移到某桌（0 = 移回尚未安排）；若與家人同組，會單獨分出（保留修改碼）
create or replace function public.feast_admin_move(p_pass text, p_person uuid, p_table int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_family uuid;
  v_size int;
  v_new uuid;
begin
  perform feast_admin_check(p_pass);
  if coalesce(p_table, 0) <> 0 and not exists (select 1 from feast_tables where no = p_table) then
    raise exception '桌號不正確';
  end if;

  select family_id into v_family from feast_people where id = p_person;
  if v_family is null then raise exception '找不到這個人，請重新整理'; end if;

  select count(*) into v_size from feast_people where family_id = v_family;
  if v_size > 1 then
    insert into feast_families (code, area, note, table_no, created_at)
    select code, area, note, nullif(p_table, 0), created_at from feast_families where id = v_family
    returning id into v_new;
    update feast_people set family_id = v_new where id = p_person;
  else
    update feast_families set table_no = nullif(p_table, 0) where id = v_family;
  end if;

  return feast_admin_overview(p_pass);
end $$;

revoke execute on function public.feast_admin_check(text) from public, anon, authenticated;
grant execute on function public.feast_admin_overview(text) to anon, authenticated;
grant execute on function public.feast_admin_move(text, uuid, int) to anon, authenticated;

-- 後台「報名資料」分頁：所有人的完整資料（含尚未報名的桌長）
create or replace function public.feast_admin_people(p_pass text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform feast_admin_check(p_pass);
  return coalesce((
    select jsonb_agg(r order by (r->>'table_sort')::int, (r->>'is_captain')::boolean desc, r->>'created')
    from (
      select jsonb_build_object(
        'name', p.name, 'gender', coalesce(p.gender, ''), 'role', coalesce(p.role, ''),
        'area', f.area, 'note', f.note, 'code', f.code,
        'table', coalesce(f.table_no, 0), 'table_sort', coalesce(f.table_no, 9999),
        'captain', coalesce(t.captain, ''), 'is_captain', (t.captain is not null and p.name = t.captain),
        'source', case when f.note = '名單匯入' then '名單匯入' else '網站報名' end,
        'family_size', (select count(*) from feast_people q where q.family_id = f.id),
        'created', to_char(f.created_at at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI')) as r
      from feast_people p
      join feast_families f on f.id = p.family_id
      left join feast_tables t on t.no = f.table_no
      union all
      select jsonb_build_object(
        'name', t.captain, 'gender', '', 'role', '', 'area', '', 'note', '', 'code', '',
        'table', t.no, 'table_sort', t.no, 'captain', t.captain, 'is_captain', true,
        'source', '桌長（未報名）', 'family_size', 0, 'created', '')
      from feast_tables t
      where t.captain <> ''
        and not exists (select 1 from feast_people p join feast_families f on f.id = p.family_id
                        where f.table_no = t.no and p.name = t.captain)
    ) x
  ), '[]'::jsonb);
end $$;
grant execute on function public.feast_admin_people(text) to anon, authenticated;
