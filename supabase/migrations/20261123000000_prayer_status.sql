-- 代禱牆：已邀約 💌 / 答應會來 ⭐
alter table public.prayer_entries
  add column if not exists status         text not null default 'none',
  add column if not exists status_by      text,
  add column if not exists status_by_name text,
  add column if not exists status_at      timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prayer_entries_status_check') then
    alter table public.prayer_entries
      add constraint prayer_entries_status_check check (status in ('none', 'invited', 'coming'));
  end if;
end $$;
